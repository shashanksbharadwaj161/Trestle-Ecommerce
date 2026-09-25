/**
 * End-to-end verification of the full local two-chain flow against a RUNNING app + relayer:
 *   pnpm chains:up && pnpm contracts:deploy && pnpm seed && pnpm dev   (and)   pnpm relayer
 *   BASE_URL=http://localhost:3000 pnpm e2e:local
 *
 * Acts exactly like the browser: SIWE over HTTP (cookies), server-built calldata signed by real wallets,
 * /api/chain/sync after each tx, gasless actions through /api/aa/*. Uses Anvil's public dev keys.
 */
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { getChainProfiles, getDeployment } from "@trestle/shared";
import {
  trestleEscrowAbi,
  trestleLoyaltyAbi,
  trestlePaymentRouterAbi,
  trestleReputationAbi,
} from "@trestle/shared/abis";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const KEYS = {
  admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  chronos: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  noah: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  mallory: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", // anvil #8
} as const;
const [A, B] = getChainProfiles("local");
const clients = Object.fromEntries(
  [A, B].map((p) => [
    p.chain.id,
    createPublicClient({ chain: p.chain, transport: http(p.rpcUrl), pollingInterval: 250 }),
  ]),
);
const log = (...a: unknown[]) => console.log("  ", ...a);
const step = (s: string) => console.log(`\n▶ ${s}`);
const evidence: Record<string, unknown> = {};

class Session {
  cookies = new Map<string, string>();
  constructor(
    public name: string,
    public pk: Hex,
  ) {}
  get account() {
    return privateKeyToAccount(this.pk);
  }
  async req<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
    const res = await fetch(BASE + path, {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        origin: BASE,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k, ...v] = kv!.split("=");
      this.cookies.set(k!.trim(), v.join("="));
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok)
      throw new Error(
        `${this.name} ${method ?? (body ? "POST" : "GET")} ${path} → ${res.status}: ${JSON.stringify(data?.error ?? data)}`,
      );
    return data as T;
  }
  async signIn() {
    const { nonce } = await this.req("/api/auth/nonce");
    const host = new URL(BASE).host;
    const message = createSiweMessage({
      address: this.account.address,
      chainId: B.chain.id,
      domain: host,
      nonce,
      uri: BASE,
      version: "1",
      issuedAt: new Date(),
    });
    const signature = await this.account.signMessage({ message });
    const { user } = await this.req("/api/auth/verify", { message, signature });
    log(`${this.name} signed in as ${user.walletAddress} (${user.role})`);
    return user;
  }
  wallet(chainId: number) {
    const p = [A, B].find((x) => x.chain.id === chainId)!;
    return createWalletClient({ account: this.account, chain: p.chain, transport: http(p.rpcUrl) });
  }
  async runCalls(
    calls: {
      chainId: number;
      to: Hex;
      data: Hex;
      value: string;
      description: string;
      requiresAllowance?: { token: Hex; owner: Hex; spender: Hex; amount: string };
    }[],
  ) {
    const hashes: Hex[] = [];
    for (const c of calls) {
      if (c.requiresAllowance) {
        const a = c.requiresAllowance;
        const allowance = await clients[c.chainId]!.readContract({
          address: a.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [a.owner, a.spender],
        });
        if (allowance >= BigInt(a.amount)) {
          log(`skip (allowance ok): ${c.description}`);
          continue;
        }
      }
      const hash = await this.wallet(c.chainId).sendTransaction({
        to: c.to,
        data: c.data,
        value: BigInt(c.value),
      });
      const r = await clients[c.chainId]!.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`tx reverted: ${c.description} ${hash}`);
      const sync = await this.req("/api/chain/sync", { chainId: c.chainId, txHash: hash });
      log(`✓ ${c.description} → ${hash} (chain ${c.chainId}; applied ${sync.applied} events)`);
      hashes.push(hash);
    }
    return hashes;
  }
  async gasless(action: Record<string, unknown>) {
    const prep = await this.req("/api/aa/prepare", action);
    const signature = await this.account.signMessage({ message: { raw: prep.userOpHash } });
    const res = await this.req("/api/aa/submit", {
      chainId: prep.chainId,
      userOpHash: prep.userOpHash,
      signature,
    });
    if (!res.success) throw new Error(`userop failed: ${res.reason}`);
    log(
      `✓ gasless ${String(action.action)} from smart account ${prep.sender} → handleOps ${res.txHash} (gas paid by paymaster: ${res.actualGasCost} wei)`,
    );
    return { ...res, sender: prep.sender };
  }
}

async function waitFor<T>(
  what: string,
  fn: () => Promise<T | undefined | null | false>,
  timeoutMs = 90_000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function main() {
  const depA = getDeployment("local", A.chain.id)!;
  const depB = getDeployment("local", B.chain.id)!;
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (!health.ok) throw new Error("app not healthy: " + JSON.stringify(health));

  const noah = new Session("buyer(noah)", KEYS.noah);
  const chronos = new Session("seller(chronos)", KEYS.chronos);
  const admin = new Session("admin", KEYS.admin);
  await noah.signIn();
  await chronos.signIn();
  await admin.signIn();

  // ─────────────────────────────── 1. cross-chain checkout: ETH on chain A → tUSDC escrow on chain B
  step("Cross-chain checkout: pay ETH on chain A, seller paid tUSDC on chain B");
  const catalog = await noah.req(`/api/products?q=Meridian`);
  const product = catalog.items[0];
  const variant = product.variants.find((v: any) => v.stock > 0);
  const sellerId = product.seller.id;
  await noah.req("/api/cart", { op: "clear" });
  await noah.req("/api/cart", { op: "add", variantId: variant.id, quantity: 1 });
  const stockBefore = variant.stock;
  const quote = await noah.req("/api/checkout/quote", { sellerId });
  const route = quote.routes.find(
    (r: any) => r.sourceChainId === A.chain.id && r.payToken.symbol === "ETH" && r.available,
  );
  if (!route)
    throw new Error(
      "no cross-chain ETH route available: " +
        JSON.stringify(quote.routes.map((r: any) => [r.key, r.available, r.reason])),
    );
  log(
    `quote ${quote.quoteId}: pay ${route.sourceAmount} wei ETH (fee ${route.feeAmount}) → seller escrow ${route.destAmount} tUSDC units; security ${route.securityScore}`,
  );
  const init = await noah.req("/api/checkout/initiate", {
    quoteId: quote.quoteId,
    routeKey: route.key,
    buyerAccountMode: "smart",
    shippingAddress: {
      name: "Noah Patel",
      line1: "221 Market Lane",
      city: "Austin",
      postalCode: "78701",
      country: "US",
    },
  });
  const replay = await noah.req("/api/checkout/initiate", {
    quoteId: quote.quoteId,
    routeKey: route.key,
    buyerAccountMode: "smart",
    shippingAddress: {
      name: "Noah Patel",
      line1: "221 Market Lane",
      city: "Austin",
      postalCode: "78701",
      country: "US",
    },
  });
  if (replay.orderId !== init.orderId) throw new Error("initiate is not idempotent");
  log(`order ${init.orderId} created (idempotent replay returned the same order)`);
  const sellerUsdcBefore = await clients[B.chain.id]!.readContract({
    address: depB.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [chronos.account.address],
  });
  await noah.runCalls(init.calls);
  const escrowed = await waitFor("relayer to fulfil the intent", async () => {
    const o = await noah.req(`/api/orders/${init.orderId}`);
    return o.order.status === "ESCROWED" && o.order.paymentIntents.at(-1).settleTxHash
      ? o
      : undefined;
  });
  const intent = escrowed.order.paymentIntents.at(-1);
  log(`intent ${intent.onchainIntentId}: ${intent.txHashes.map((t: any) => t.status).join(" → ")}`);
  log(
    `fulfil tx (chain B) ${intent.fulfillTxHash}; settlement proof (chain A) ${intent.settleTxHash}; escrow #${escrowed.order.escrowContractOrderId}`,
  );
  const onchainIntent = await clients[A.chain.id]!.readContract({
    address: depA.paymentRouter,
    abi: trestlePaymentRouterAbi,
    functionName: "getIntent",
    args: [intent.onchainIntentId],
  });
  const escrowOrder = await clients[B.chain.id]!.readContract({
    address: depB.escrow,
    abi: trestleEscrowAbi,
    functionName: "getOrder",
    args: [BigInt(escrowed.order.escrowContractOrderId)],
  });
  if ((onchainIntent as any).status !== 2) throw new Error("source intent not Settled on-chain");
  if ((escrowOrder as any).status !== 1 || (escrowOrder as any).amount !== BigInt(route.destAmount))
    throw new Error("escrow not funded with exact amount");
  log(
    `on-chain check: source intent status=Settled, escrow status=Created amount=${(escrowOrder as any).amount} buyer=${(escrowOrder as any).buyer}`,
  );
  evidence.crossChain = {
    orderId: init.orderId,
    intentId: intent.onchainIntentId,
    sourceTx: intent.sourceTxHash,
    fulfillTx: intent.fulfillTxHash,
    settleTx: intent.settleTxHash,
  };

  step(
    "Seller marks shipped; buyer confirms delivery gaslessly (ERC-4337 smart account, paymaster-sponsored)",
  );
  await chronos.req(`/api/orders/${init.orderId}/fulfillment`, {
    action: "ship",
    trackingNumber: "1ZE2ETEST0001",
  });
  const smartAccount = (escrowOrder as any).buyer as Hex;
  const smartBalance = await clients[B.chain.id]!.getBalance({ address: smartAccount });
  log(`buyer smart account ${smartAccount} holds ${smartBalance} wei native gas`);
  const confirm = await noah.gasless({ action: "confirmDelivery", orderId: init.orderId });
  const done = await noah.req(`/api/orders/${init.orderId}`);
  if (done.order.status !== "COMPLETED")
    throw new Error(`expected COMPLETED, got ${done.order.status}`);
  const sellerUsdcAfter = await clients[B.chain.id]!.readContract({
    address: depB.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [chronos.account.address],
  });
  if (sellerUsdcAfter - sellerUsdcBefore !== BigInt(route.destAmount))
    throw new Error("seller payout mismatch");
  const rep = await clients[B.chain.id]!.readContract({
    address: depB.reputation,
    abi: trestleReputationAbi,
    functionName: "getScore",
    args: [smartAccount],
  });
  const trst = await clients[B.chain.id]!.readContract({
    address: depB.loyalty,
    abi: trestleLoyaltyAbi,
    functionName: "balanceOf",
    args: [smartAccount],
  });
  log(
    `order COMPLETED; seller received exactly ${sellerUsdcAfter - sellerUsdcBefore} tUSDC units; buyer rep=${rep} (wad) TRST=${trst}`,
  );
  const repApi = await noah.req(`/api/reputation/${noah.account.address}`);
  const loyaltyApi = await noah.req(`/api/loyalty`);
  const smartLoyalty = loyaltyApi.chains
    .find((c: any) => c.chainId === B.chain.id)
    .accounts.find((a: any) => a.kind === "smart");
  if (BigInt(smartLoyalty.balance) !== trst) throw new Error("loyalty API mismatch");
  log(
    `API reflects: reputation accounts=${repApi.accounts.length}, smart-account TRST=${smartLoyalty.balance}`,
  );
  const pAfter = await noah.req(`/api/products/${product.id}`);
  log(
    `stock ${stockBefore} → ${pAfter.product.variants.find((v: any) => v.id === variant.id).stock}`,
  );
  evidence.gaslessConfirm = {
    handleOpsTx: confirm.txHash,
    gasPaidByPaymasterWei: confirm.actualGasCost,
    smartAccount,
  };

  step("Seller transfers the item's authenticity certificate to the buyer (on-chain provenance)");
  let transfer: any;
  try {
    transfer = await chronos.req("/api/certificates/transfer", { orderId: init.orderId });
  } catch (e) {
    if (!/409/.test((e as Error).message)) throw e;
    // no unallocated certificate left for this product: the (verified) seller mints one first
    log("seller holds no spare certificate — minting one");
    const mint = await chronos.req("/api/certificates/mint", {
      productId: product.id,
      batch: `E2E-${Date.now()}`,
    });
    await chronos.runCalls(mint.calls);
    transfer = await chronos.req("/api/certificates/transfer", { orderId: init.orderId });
  }
  await chronos.runCalls(transfer.calls);
  const certs = (await noah.req(`/api/products/${product.id}`)).product.certificates;
  const moved = certs.find((c: any) => c.tokenId === transfer.certificate.tokenId);
  if (moved.ownerAddress !== smartAccount.toLowerCase())
    throw new Error("certificate owner not updated");
  const live = await (
    await fetch(`${BASE}/api/certificates/${B.chain.id}/${transfer.certificate.tokenId}`)
  ).json();
  log(
    `certificate #${transfer.certificate.tokenId} now owned by ${live.owner}; provenance records: ${live.history.length}`,
  );
  evidence.certificateTransfer = {
    tokenId: transfer.certificate.tokenId,
    owner: live.owner,
    provenanceRecords: live.history.length,
  };

  step("Gasless staking of earned TRST from the smart account");
  const half = trst / 2n;
  const readStake = () =>
    clients[B.chain.id]!.readContract({
      address: depB.loyalty,
      abi: trestleLoyaltyAbi,
      functionName: "stakedBalance",
      args: [smartAccount],
    });
  const stakedBefore = await readStake();
  await noah.gasless({ action: "stake", chainId: B.chain.id, amount: half.toString() });
  const staked = await readStake();
  if (staked - stakedBefore !== half) throw new Error("stake mismatch");
  log(`staked ${half} TRST-wei (total stake ${staked})`);

  // ─────────────────────────────── 2. dispute: direct tUSDC checkout on chain B, admin splits 50/50
  step("Direct checkout on chain B with the wallet, then dispute → admin resolves 50/50");
  await noah
    .wallet(B.chain.id)
    .writeContract({
      address: depB.usdc,
      abi: parseAbi(["function faucet()"]),
      functionName: "faucet",
    })
    .then((h) => clients[B.chain.id]!.waitForTransactionReceipt({ hash: h }))
    .catch(() => log("faucet cooldown — using existing balance"));
  const poster = (await noah.req(`/api/products?q=Watch Roll`)).items[0];
  const pv = poster.variants.find((v: any) => v.stock > 0);
  const q2 = await noah.req("/api/checkout/quote", {
    sellerId: poster.seller.id,
    items: [{ variantId: pv.id, quantity: 1 }],
  });
  const direct = q2.routes.find(
    (r: any) => r.kind === "direct" && r.payToken.symbol === "tUSDC" && r.available,
  );
  const i2 = await noah.req("/api/checkout/initiate", {
    quoteId: q2.quoteId,
    routeKey: direct.key,
    buyerAccountMode: "wallet",
    shippingAddress: {
      name: "Noah Patel",
      line1: "221 Market Lane",
      city: "Austin",
      postalCode: "78701",
      country: "US",
    },
  });
  await noah.runCalls(i2.calls);
  let o2 = await noah.req(`/api/orders/${i2.orderId}`);
  if (o2.order.status !== "ESCROWED") throw new Error(`expected ESCROWED, got ${o2.order.status}`);
  const buyerBefore = await clients[B.chain.id]!.readContract({
    address: depB.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [noah.account.address],
  });
  const filed = await noah.req("/api/disputes", {
    orderId: i2.orderId,
    reason: "Stitching on the roll is coming apart after two days.",
    evidence: "photos: https://example.com/e2e",
  });
  if (filed.via !== "wallet") throw new Error("expected wallet dispute path");
  await noah.runCalls(filed.calls);
  o2 = await noah.req(`/api/orders/${i2.orderId}`);
  if (o2.order.status !== "DISPUTED") throw new Error(`expected DISPUTED, got ${o2.order.status}`);
  log(`order DISPUTED, escrow on-chain status: ${o2.escrow.status}`);
  const queue = await admin.req(`/api/disputes?status=OPEN`);
  const d = queue.disputes.find((x: any) => x.order.id === i2.orderId);
  const resolve = await admin.req(`/api/disputes/${d.id}/resolve`, {
    buyerShareBps: 5000,
    notes: "E2E: partial damage, split 50/50.",
  });
  await admin.runCalls(resolve.calls);
  o2 = await noah.req(`/api/orders/${i2.orderId}`);
  const buyerAfter = await clients[B.chain.id]!.readContract({
    address: depB.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [noah.account.address],
  });
  if (o2.order.dispute.status !== "RESOLVED" || o2.order.dispute.buyerShareBps !== 5000)
    throw new Error("dispute not resolved");
  log(
    `dispute RESOLVED (50%): order=${o2.order.status}, escrow=${o2.escrow.status}, buyer refunded ${buyerAfter - buyerBefore} tUSDC units of ${direct.destAmount}`,
  );
  if (buyerAfter - buyerBefore !== BigInt(direct.destAmount) / 2n)
    throw new Error("refund mismatch");
  evidence.dispute = {
    orderId: i2.orderId,
    raiseTx: o2.order.dispute.raiseTxHash,
    resolveTx: o2.order.dispute.resolveTxHash,
  };

  // non-admins can't resolve
  const notAdmin = await noah
    .req(`/api/disputes/${d.id}/resolve`, { buyerShareBps: 10000, notes: "hax" })
    .then(
      () => "allowed",
      (e) => String(e.message),
    );
  if (!/403/.test(notAdmin)) throw new Error("buyer was able to call admin resolve");
  log("buyer attempt to resolve → 403 as expected");

  // ─────────────────────────────── 3. relayer refunds an intent that has no Trestle order
  step("Orphan intent (no Trestle order) is refunded by the relayer");
  const mallory = new Session("mallory", KEYS.mallory);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const hash = await mallory.wallet(A.chain.id).writeContract({
    address: depA.paymentRouter,
    abi: trestlePaymentRouterAbi,
    functionName: "createIntent",
    args: [
      {
        orderRef: ("0x" + "de".repeat(32)) as Hex,
        sourceToken: "0x0000000000000000000000000000000000000000",
        sourceAmount: 10n ** 15n,
        destChainId: BigInt(B.chain.id),
        destToken: depB.usdc,
        destAmount: 10_000_000n,
        seller: chronos.account.address,
        destBuyer: mallory.account.address,
        deliveryWindow: 86_400n,
        expiry,
      },
    ],
    value: 10n ** 15n,
  });
  const rc = await clients[A.chain.id]!.waitForTransactionReceipt({ hash });
  const created = rc.logs.find(
    (l) => l.address.toLowerCase() === depA.paymentRouter.toLowerCase(),
  )!;
  const orphanId = created.topics[1] as Hex;
  await waitFor(
    "relayer to refund the orphan intent",
    async () => {
      const i = (await clients[A.chain.id]!.readContract({
        address: depA.paymentRouter,
        abi: trestlePaymentRouterAbi,
        functionName: "getIntent",
        args: [orphanId],
      })) as any;
      return i.status === 3;
    },
    120_000,
  );
  const fulfilledOnB = await clients[B.chain.id]!.readContract({
    address: depB.paymentRouter,
    abi: trestlePaymentRouterAbi,
    functionName: "fulfilledIntents",
    args: [orphanId],
  });
  log(
    `orphan intent ${orphanId.slice(0, 18)}… → Failed (refunded) on chain A; never fulfilled on B (escrow id ${fulfilledOnB})`,
  );
  evidence.orphanRefund = { intentId: orphanId };

  step("Transparency dashboard reflects on-chain activity");
  const stats = await (await fetch(`${BASE}/api/admin/stats`)).json();
  log(
    `liveEscrows=${stats.liveEscrows} volumeSettled=${stats.volumeSettledUsdMicros} µUSD settlementMedian=${stats.settlement.medianSeconds}s sponsoredOps=${stats.sponsoredOps} events=${stats.chainEvents}`,
  );
  if (!stats.recentIntents.some((i: any) => i.onchainIntentId === intent.onchainIntentId))
    throw new Error("intent missing from transparency");
  console.log("\nE2E PASSED\n" + JSON.stringify(evidence, null, 2));
}

main().catch((e) => {
  console.error("\nE2E FAILED:", e.message);
  process.exit(1);
});
