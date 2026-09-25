/**
 * Trestle seed.
 *
 *   pnpm seed                       # NETWORK_MODE (default local); resets the DB in local mode
 *   pnpm --filter @trestle/db exec tsx seed.ts --network testnet --reset
 *
 * Local mode with both Anvil chains running and contracts deployed ("on-chain seed"):
 *   every seeded order is REAL — paid into escrow with TrestlePaymentRouter.checkoutDirect, then confirmed,
 *   disputed or resolved on-chain; certificates are minted; loyalty is staked. The resulting contract events
 *   are ingested through the same idempotent sync used by the relayer, so dashboards show real chain data.
 *   One extra order gets a real cross-chain intent on chain A that the relayer fulfils when it starts.
 *
 * Otherwise ("demo seed"): the same catalog/orders are written with isSeedDemo=true and NO transaction hashes.
 * The UI labels them as seeded demo records. Nothing is presented as on-chain unless it is.
 */
import { randomBytes } from "node:crypto";
import { zeroAddress, type Address, type Hex } from "viem";
import type { OrderStatus, Prisma } from "@prisma/client";
import {
  computeRoute,
  findTokenBySymbol,
  getChainProfiles,
  getDeployment,
  getTokens,
  isDeployed,
  orderRefFor,
  parseNetworkMode,
  parseUsdToMicros,
  priceTable,
  usdMicrosToStableAmount,
  type ChainProfile,
  type RouteQuote,
} from "@trestle/shared";
import { prisma } from "./src/client";
import { applyChainEvents, fetchTrestleEvents } from "./src/sync";
import { SELLERS, artUrl, type SeedSeller } from "./seed/catalog";
import { ANVIL_KEYS, ChainActor, anvilAddress, rpcReachable, type AnvilRole } from "./seed/onchain";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const mode = parseNetworkMode(opt("network") ?? process.env.NETWORK_MODE);
const reset = flag("reset") || (mode === "local" && !flag("no-reset"));
const profiles = getChainProfiles(mode, {
  chainARpcUrl: mode === "local" ? process.env.CHAIN_A_RPC_URL : process.env.SEPOLIA_RPC_URL,
  chainBRpcUrl: mode === "local" ? process.env.CHAIN_B_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL,
});
const [A, B] = profiles;
const prices = priceTable(process.env.PRICE_ETH_USD);
const FEE_BPS = BigInt(process.env.PROTOCOL_FEE_BPS ?? "100");
const DELIVERY_WINDOW = 14n * 24n * 3600n;

const newId = (prefix: string) => `${prefix}_${randomBytes(10).toString("hex")}`;
const lc = (a: string) => a.toLowerCase();

function placeholderAddress(label: string): Address {
  // deterministic, key-less demo address (nobody can sign as it)
  const h = Buffer.from(label.padEnd(20, "_").slice(0, 20)).toString("hex");
  return `0x${h}` as Address;
}

type BuyerKey = "ava" | "noah";
interface Scenario {
  key: string;
  buyer: BuyerKey;
  product: string;
  variant: number;
  qty: number;
  target: OrderStatus;
  review?: { rating: number; title: string; text: string };
  dispute?: { reason: string; resolveBps?: number; notes?: string };
  tracking?: string;
  crossChainPending?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    key: "s1",
    buyer: "ava",
    product: "meridian-automatic",
    variant: 0,
    qty: 1,
    target: "COMPLETED",
    tracking: "1Z999AA10123456784",
    review: {
      rating: 5,
      title: "Exactly as described",
      text: "Arrived serviced and keeping +2s/day. The certificate transferred to my wallet on delivery — love that the provenance is on-chain.",
    },
  },
  {
    key: "s2",
    buyer: "noah",
    product: "court-classic",
    variant: 1,
    qty: 1,
    target: "COMPLETED",
    tracking: "9400111899223197428490",
    review: {
      rating: 4,
      title: "Great everyday pair",
      text: "Runs half a size large. Leather quality is excellent.",
    },
  },
  { key: "s3", buyer: "ava", product: "halo-anc", variant: 0, qty: 1, target: "ESCROWED" },
  {
    key: "s4",
    buyer: "noah",
    product: "lunar-poster",
    variant: 0,
    qty: 1,
    target: "SHIPPED",
    tracking: "1Z999AA10123456785",
  },
  {
    key: "s5",
    buyer: "ava",
    product: "retro-high",
    variant: 2,
    qty: 1,
    target: "DISPUTED",
    tracking: "9400111899223197428491",
    dispute: {
      reason:
        "Box arrived crushed and the left sole is separating at the toe. Photos attached in chat.",
    },
  },
  {
    key: "s6",
    buyer: "noah",
    product: "pocket-keyboard",
    variant: 0,
    qty: 1,
    target: "REFUNDED",
    dispute: {
      reason: "Parcel never arrived; carrier shows it was returned to sender.",
      resolveBps: 10_000,
      notes: "Carrier confirmed return to sender. Full refund to buyer.",
    },
  },
  {
    key: "s7",
    buyer: "noah",
    product: "arc-lamp",
    variant: 0,
    qty: 1,
    target: "DELIVERED",
    tracking: "1Z999AA10123456786",
  },
  {
    key: "s8",
    buyer: "ava",
    product: "loopback-hoodie",
    variant: 1,
    qty: 2,
    target: "PENDING_PAYMENT",
  },
  {
    key: "s9",
    buyer: "noah",
    product: "aurora-runner",
    variant: 1,
    qty: 1,
    target: "COMPLETED",
    review: {
      rating: 5,
      title: "Lightest runner I own",
      text: "Fast shipping, deadstock as promised.",
    },
  },
  {
    key: "s10",
    buyer: "ava",
    product: "pour-over",
    variant: 0,
    qty: 2,
    target: "COMPLETED",
    dispute: {
      reason: "One of the two cups arrived chipped.",
      resolveBps: 3_000,
      notes: "Partial damage verified from photos: 30% refunded to buyer, 70% released to seller.",
    },
  },
  {
    key: "s11",
    buyer: "noah",
    product: "watch-roll",
    variant: 0,
    qty: 1,
    target: "PENDING_PAYMENT",
    crossChainPending: true,
  },
];

async function wipe() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.review.deleteMany(),
    prisma.dispute.deleteMany(),
    prisma.paymentIntent.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.authenticityCertificate.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.seller.deleteMany(),
    prisma.reputationEvent.deleteMany(),
    prisma.loyaltyTransaction.deleteMany(),
    prisma.smartAccount.deleteMany(),
    prisma.user.deleteMany(),
    prisma.chainEvent.deleteMany(),
    prisma.relayerCheckpoint.deleteMany(),
    prisma.supportedChain.deleteMany(),
  ]);
}

async function main() {
  const existing = await prisma.order.count();
  if (existing > 0 && !reset) {
    console.log(`Database already has ${existing} orders. Re-run with --reset to wipe and reseed.`);
    return;
  }
  if (reset) await wipe();

  const deployed = isDeployed(mode);
  const onchainRequested = !flag("no-onchain") && mode === "local";
  const onchain =
    onchainRequested && deployed && (await rpcReachable(A)) && (await rpcReachable(B));
  console.log(
    `Seeding Trestle (${mode}) — ${onchain ? "ON-CHAIN (real transactions on local Anvil chains)" : "demo records only (no chain writes)"}`,
  );

  // ---------------------------------------------------------------- chains
  for (const p of profiles) {
    await prisma.supportedChain.create({
      data: {
        chainId: p.chain.id,
        name: p.label,
        rpcUrl: p.rpcUrl,
        nativeToken: p.chain.nativeCurrency.symbol,
        isTestnetDemo: p.isTestnetDemo,
        networkMode: mode,
        role: p.role,
        explorerUrl: p.explorerUrl ?? null,
      },
    });
  }

  // ---------------------------------------------------------------- users
  const addr = (
    role: AnvilRole,
    envList: string | undefined,
    idx: number,
    label: string,
  ): Address => {
    if (mode === "local") return anvilAddress(role);
    const list =
      envList
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    return (list[idx] as Address | undefined) ?? placeholderAddress(label);
  };
  const adminAddress =
    mode === "local"
      ? anvilAddress("deployer")
      : ((process.env.SEED_ADMIN_ADDRESS as Address | undefined) ??
        getDeployment(mode, B.chain.id)?.arbiter ??
        placeholderAddress("admin"));

  const admin = await prisma.user.create({
    data: { walletAddress: lc(adminAddress), displayName: "Trestle Arbitration", role: "ADMIN" },
  });
  const buyers: Record<BuyerKey, { id: string; address: Address }> = {} as never;
  for (const [i, [key, name]] of (
    [
      ["ava", "Ava Chen"],
      ["noah", "Noah Patel"],
    ] as const
  ).entries()) {
    const address = addr(key, process.env.SEED_BUYER_ADDRESSES, i, `buyer-${key}`);
    const u = await prisma.user.create({
      data: { walletAddress: lc(address), displayName: name, role: "BUYER" },
    });
    buyers[key] = { id: u.id, address };
  }

  // ---------------------------------------------------------------- sellers & catalog
  const sellerRows: Record<
    SeedSeller["key"],
    {
      id: string;
      address: Address;
      payoutChain: ChainProfile;
      payoutToken: Address;
      symbol: string;
    }
  > = {} as never;
  const productRows = new Map<
    string,
    {
      id: string;
      sellerKey: SeedSeller["key"];
      priceMicros: bigint;
      title: string;
      variants: { id: string; name: string }[];
    }
  >();

  for (const [i, s] of SELLERS.entries()) {
    const address = addr(s.key, process.env.SEED_SELLER_ADDRESSES, i, `seller-${s.key}`);
    const payoutProfile = s.payoutChain === "A" ? A : B;
    const token = findTokenBySymbol(mode, payoutProfile.chain.id, s.payoutSymbol);
    const payoutToken = (token?.address ?? zeroAddress) as Address;
    const user = await prisma.user.create({
      data: { walletAddress: lc(address), displayName: s.storefrontName, role: "SELLER" },
    });
    const seller = await prisma.seller.create({
      data: {
        userId: user.id,
        storefrontName: s.storefrontName,
        slug: s.slug,
        bio: s.bio,
        payoutChainId: payoutProfile.chain.id,
        payoutToken: lc(payoutToken),
        payoutAddress: lc(address),
        verified: s.verified,
        verifiedAt: s.verified ? new Date() : null,
        avatarUrl: artUrl(`seller-${s.key}`, "seller"),
        bannerUrl: artUrl(`banner-${s.key}`, "banner"),
      },
    });
    sellerRows[s.key] = {
      id: seller.id,
      address,
      payoutChain: payoutProfile,
      payoutToken,
      symbol: s.payoutSymbol,
    };

    for (const p of s.products) {
      const product = await prisma.product.create({
        data: {
          sellerId: seller.id,
          title: p.title,
          description: p.description,
          images: [
            artUrl(p.key, p.category, 0),
            artUrl(p.key, p.category, 1),
            artUrl(p.key, p.category, 2),
          ],
          priceUsdMicros: parseUsdToMicros(p.price),
          category: p.category,
          chainListingOptions: profiles.map((x) => x.chain.id),
          featured: p.featured ?? false,
          manufacturer: p.manufacturer ?? null,
          status: "ACTIVE",
          variants: {
            create: p.variants.map((v, vi) => ({
              name: v.name,
              attributes: v.attributes,
              stock: v.stock,
              sku: `${s.key.toUpperCase()}-${p.key.toUpperCase()}-${vi + 1}`,
            })),
          },
        },
        include: { variants: { orderBy: { sku: "asc" } } },
      });
      productRows.set(p.key, {
        id: product.id,
        sellerKey: s.key,
        priceMicros: product.priceUsdMicros,
        title: product.title,
        variants: product.variants.map((v) => ({ id: v.id, name: v.name })),
      });
    }
  }

  // ---------------------------------------------------------------- orders
  const actors = onchain
    ? {
        [A.chain.id]: new ChainActor(A, getDeployment(mode, A.chain.id)!),
        [B.chain.id]: new ChainActor(B, getDeployment(mode, B.chain.id)!),
      }
    : undefined;
  const startBlocks = new Map<number, bigint>();
  if (actors)
    for (const [id, a] of Object.entries(actors))
      startBlocks.set(Number(id), await a.public.getBlockNumber());

  const created: {
    scenario: Scenario;
    orderId: string;
    ref: Hex;
    sellerKey: SeedSeller["key"];
    productId: string;
  }[] = [];

  for (const sc of SCENARIOS) {
    const prod = productRows.get(sc.product)!;
    const seller = sellerRows[prod.sellerKey];
    const variant = prod.variants[sc.variant]!;
    const subtotal = prod.priceMicros * BigInt(sc.qty);
    const payoutToken = getTokens(mode, seller.payoutChain.chain.id).find(
      (t) => t.address.toLowerCase() === seller.payoutToken.toLowerCase(),
    );
    const payoutAmount = payoutToken ? usdMicrosToStableAmount(subtotal, payoutToken) : subtotal;
    const orderId = newId("ord");
    const ref = orderRefFor(orderId);
    const buyer = buyers[sc.buyer];

    // route: seeded orders pay directly on the payout chain; s11 is a live cross-chain intent from the other chain
    const sourceProfile = sc.crossChainPending
      ? seller.payoutChain.role === "A"
        ? B
        : A
      : seller.payoutChain;
    const payToken = sc.crossChainPending
      ? getTokens(mode, sourceProfile.chain.id).find((t) => t.isNative)
      : payoutToken;
    const quote =
      payToken && payoutToken
        ? (computeRoute({
            subtotalUsdMicros: subtotal,
            payToken,
            payoutToken,
            sourceProfile,
            destProfile: seller.payoutChain,
            prices,
            effectiveFeeBps: FEE_BPS,
            solverSpreadBps: 10n,
          }) as RouteQuote)
        : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: orderId,
          buyerId: buyer.id,
          sellerId: seller.id,
          status: onchain ? "PENDING_PAYMENT" : sc.target,
          subtotalUsdMicros: subtotal,
          payoutChainId: seller.payoutChain.chain.id,
          payoutToken: lc(seller.payoutToken),
          payoutAmount: payoutAmount.toString(),
          onchainRef: ref.toLowerCase(),
          buyerAccount: lc(buyer.address),
          isSeedDemo: !onchain,
          reservationExpiresAt:
            sc.target === "PENDING_PAYMENT" ? new Date(Date.now() + 2 * 24 * 3600_000) : null,
          shippingAddress: {
            name: sc.buyer === "ava" ? "Ava Chen" : "Noah Patel",
            line1: sc.buyer === "ava" ? "18 Harbour Street" : "221 Market Lane",
            city: sc.buyer === "ava" ? "Sydney" : "Austin",
            postalCode: sc.buyer === "ava" ? "2000" : "78701",
            country: sc.buyer === "ava" ? "AU" : "US",
          },
          items: {
            create: {
              productId: prod.id,
              productVariantId: variant.id,
              titleSnapshot: prod.title,
              variantSnapshot: variant.name,
              quantity: sc.qty,
              unitPriceUsdMicros: prod.priceMicros,
            },
          },
        },
      });
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stock: { decrement: sc.qty } },
      });
      if (quote) {
        await tx.paymentIntent.create({
          data: {
            orderId,
            routeKind: quote.kind === "direct" ? "DIRECT" : "CROSS_CHAIN",
            routeId: quote.routeId,
            payer: lc(buyer.address),
            sourceChainId: quote.sourceChainId,
            sourceToken: lc(quote.payToken.address),
            sourceAmount: quote.sourceAmount.toString(),
            feeAmount: quote.feeAmount.toString(),
            destChainId: quote.destChainId,
            destToken: lc(quote.payoutToken.address),
            destAmount: quote.destAmount.toString(),
            destBuyer: lc(buyer.address),
            deliveryWindowSec: Number(DELIVERY_WINDOW),
            status: !onchain && sc.target !== "PENDING_PAYMENT" ? "FULFILLED" : "CREATED",
            expiresAt: new Date(Date.now() + 60 * 60_000),
            securityScore: quote.securityScore,
            estimatedSeconds: quote.estimatedSeconds,
            txHashes: [],
          },
        });
      }
    });
    created.push({ scenario: sc, orderId, ref, sellerKey: prod.sellerKey, productId: prod.id });

    if (!actors || !quote) continue;

    // ------------------------------------------------ real on-chain lifecycle
    const role = sc.buyer as AnvilRole;
    if (sc.crossChainPending) {
      const src = actors[quote.sourceChainId]!;
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      await src.routerCall(
        role,
        "createIntent",
        [
          {
            orderRef: ref,
            sourceToken: zeroAddress,
            sourceAmount: quote.sourceAmount,
            destChainId: BigInt(quote.destChainId),
            destToken: quote.payoutToken.address,
            destAmount: quote.destAmount,
            seller: seller.address,
            destBuyer: buyer.address,
            deliveryWindow: DELIVERY_WINDOW,
            expiry,
          },
        ],
        quote.sourceAmount,
      );
      await prisma.paymentIntent.updateMany({
        where: { orderId },
        data: { expiresAt: new Date(Number(expiry) * 1000) },
      });
      continue;
    }
    if (sc.target === "PENDING_PAYMENT") continue;

    const chain = actors[quote.destChainId]!;
    await chain.mintToken(quote.payToken.address, buyer.address, quote.sourceAmount);
    await chain.checkoutDirect(role, {
      orderRef: ref,
      token: quote.payToken.address,
      escrowAmount: quote.destAmount,
      seller: seller.address,
      buyerAccount: buyer.address,
      window: DELIVERY_WINDOW,
    });
    const escrowId = await chain.escrowIdForRef(ref, startBlocks.get(quote.destChainId)!);
    if (escrowId === undefined) throw new Error(`escrow order not found for ${sc.key}`);

    if (sc.dispute) {
      await chain.escrowCall(role, "raiseDispute", [escrowId, sc.dispute.reason]);
      if (sc.dispute.resolveBps !== undefined) {
        await chain.escrowCall("deployer", "resolveDispute", [
          escrowId,
          BigInt(sc.dispute.resolveBps),
        ]);
      }
    } else if (sc.target === "COMPLETED") {
      await chain.escrowCall(role, "confirmDelivery", [escrowId]);
    }
  }

  // ---------------------------------------------------------------- certificates, loyalty staking
  if (actors) {
    const chronos = sellerRows.chronos;
    const chain = actors[chronos.payoutChain.chain.id]!;
    for (const [key, batch] of [
      ["meridian-automatic", "MH-2026-B7/SN-004417"],
      ["meridian-automatic", "MH-2026-B7/SN-004418"],
      ["aviator-gmt", "NWI-LTD-250/SN-0113"],
      ["lunar-poster", "AE-1969-LITHO-01"],
      ["leica-m3", "WO-M3-1958/SN-0871223"],
    ] as const) {
      const p = productRows.get(key)!;
      const man = SELLERS[0]!.products.find((x) => x.key === key)!.manufacturer ?? "";
      await chain.authenticityCall("chronos", "mintCertificateWithDetails", [
        chronos.address,
        p.id,
        man,
        batch,
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/certificates/metadata/${p.id}`,
      ]);
    }
    // the sold Meridian's certificate moves to its buyer → on-chain provenance
    await chain.authenticityCall("chronos", "transferFrom", [
      chronos.address,
      buyers.ava.address,
      1n,
    ]);

    // Ava stakes part of her earned TRST on chain B
    const bChain = actors[B.chain.id]!;
    await bChain.loyaltyCall("ava", "stake", [50n * 10n ** 18n]);
  }

  // ---------------------------------------------------------------- ingest real chain events
  if (actors) {
    for (const [id, actor] of Object.entries(actors)) {
      const chainId = Number(id);
      const dep = getDeployment(mode, chainId)!;
      const head = await actor.public.getBlockNumber();
      const events = await fetchTrestleEvents(
        actor.public,
        mode,
        chainId,
        BigInt(dep.deployBlock),
        head,
      );
      const results = await applyChainEvents(prisma, events);
      const applied = results.filter((r) => r.status === "applied").length;
      console.log(`  chain ${chainId}: ingested ${events.length} events (${applied} applied)`);
      await prisma.relayerCheckpoint.upsert({
        where: { id: `${chainId}` },
        create: { id: `${chainId}`, chainId, lastBlock: head },
        update: { lastBlock: head },
      });
    }
    // certificate metadata that events don't carry
    for (const c of await prisma.authenticityCertificate.findMany()) {
      const p = [...productRows.values()].find((x) => x.id === c.productId);
      const man = SELLERS.flatMap((s) => s.products).find(
        (x) => productRows.get(x.key)?.id === c.productId,
      )?.manufacturer;
      await prisma.authenticityCertificate.update({
        where: { id: c.id },
        data: {
          manufacturer: man ?? null,
          metadataUri: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/certificates/metadata/${p?.id ?? c.productId}`,
        },
      });
    }
  }

  // ---------------------------------------------------------------- off-chain lifecycle (shipping) + reviews
  for (const c of created) {
    const sc = c.scenario;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } });
    const data: Prisma.OrderUpdateInput = {};
    if (sc.tracking) {
      data.trackingNumber = sc.tracking;
      data.shippedAt = new Date(Date.now() - 3 * 24 * 3600_000);
    }
    if (
      onchain &&
      (sc.target === "SHIPPED" || sc.target === "DELIVERED") &&
      order.status === "ESCROWED"
    ) {
      data.status = sc.target; // carrier-side states are off-chain by design
    }
    if (!onchain && sc.target === "COMPLETED") data.completedAt = new Date();
    if (Object.keys(data).length) await prisma.order.update({ where: { id: c.orderId }, data });

    if (!onchain && sc.dispute) {
      await prisma.dispute.create({
        data: {
          orderId: c.orderId,
          raisedById: buyers[sc.buyer].id,
          raisedByAddress: lc(buyers[sc.buyer].address),
          reason: sc.dispute.reason,
          status: sc.dispute.resolveBps !== undefined ? "RESOLVED" : "OPEN",
          buyerShareBps: sc.dispute.resolveBps ?? null,
          resolutionNotes: sc.dispute.notes ?? null,
          resolvedById: sc.dispute.resolveBps !== undefined ? admin.id : null,
          resolvedAt: sc.dispute.resolveBps !== undefined ? new Date() : null,
        },
      });
    } else if (onchain && sc.dispute?.notes) {
      await prisma.dispute.updateMany({
        where: { orderId: c.orderId },
        data: { resolutionNotes: sc.dispute.notes },
      });
    }

    if (sc.review) {
      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } });
      if (fresh.status === "COMPLETED") {
        await prisma.review.create({
          data: {
            orderId: c.orderId,
            productId: c.productId,
            authorId: buyers[sc.buyer].id,
            rating: sc.review.rating,
            title: sc.review.title,
            text: sc.review.text,
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------- demo reputation/loyalty history (no chain)
  if (!onchain) {
    const demoRep: [
      string,
      string,
      "PURCHASE_COMPLETED" | "SALE_COMPLETED" | "DISPUTE_LOST" | "DISPUTE_SPLIT",
      number,
      string,
    ][] = [
      [buyers.ava.id, buyers.ava.address, "PURCHASE_COMPLETED", 10, "10"],
      [buyers.noah.id, buyers.noah.address, "PURCHASE_COMPLETED", 10, "10"],
      [buyers.noah.id, buyers.noah.address, "PURCHASE_COMPLETED", 10, "20"],
      [buyers.ava.id, buyers.ava.address, "DISPUTE_SPLIT", -5, "5"],
    ];
    for (const [userId, address, eventType, weight, newScore] of demoRep) {
      await prisma.reputationEvent.create({
        data: {
          userId,
          address: lc(address),
          chainId: B.chain.id,
          eventType,
          weight,
          newScore,
          isSeedDemo: true,
        },
      });
      await prisma.user.update({ where: { id: userId }, data: { reputationScoreCache: newScore } });
    }
    for (const [key, sellerData] of Object.entries(sellerRows)) {
      const u = await prisma.seller.findUniqueOrThrow({ where: { id: sellerData.id } });
      const score = key === "lumen" ? "-25" : "20";
      await prisma.reputationEvent.create({
        data: {
          userId: u.userId,
          address: lc(sellerData.address),
          chainId: sellerData.payoutChain.chain.id,
          eventType: key === "lumen" ? "DISPUTE_LOST" : "SALE_COMPLETED",
          weight: key === "lumen" ? -25 : 10,
          newScore: score,
          isSeedDemo: true,
        },
      });
      await prisma.user.update({ where: { id: u.userId }, data: { reputationScoreCache: score } });
    }
    await prisma.loyaltyTransaction.createMany({
      data: [
        {
          userId: buyers.ava.id,
          address: lc(buyers.ava.address),
          chainId: B.chain.id,
          type: "EARNED",
          amount: (625n * 10n ** 17n).toString(),
          isSeedDemo: true,
        },
        {
          userId: buyers.ava.id,
          address: lc(buyers.ava.address),
          chainId: B.chain.id,
          type: "STAKED",
          amount: (50n * 10n ** 18n).toString(),
          isSeedDemo: true,
        },
        {
          userId: buyers.noah.id,
          address: lc(buyers.noah.address),
          chainId: B.chain.id,
          type: "EARNED",
          amount: (825n * 10n ** 16n).toString(),
          isSeedDemo: true,
        },
      ],
    });
  }

  const counts = await prisma.$transaction([
    prisma.user.count(),
    prisma.seller.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.chainEvent.count(),
    prisma.review.count(),
  ]);
  const byStatus = await prisma.order.groupBy({ by: ["status"], _count: true });
  console.log(
    `Seeded users=${counts[0]} sellers=${counts[1]} products=${counts[2]} orders=${counts[3]} chainEvents=${counts[4]} reviews=${counts[5]}`,
  );
  console.log("Orders by status:", Object.fromEntries(byStatus.map((s) => [s.status, s._count])));
  if (onchain) {
    console.log(
      "Demo wallets (Anvil public dev keys — import into your wallet for the local demo only):",
    );
    for (const r of ["deployer", "ava", "noah", "chronos", "sole", "lumen"] as AnvilRole[]) {
      console.log(`  ${r.padEnd(8)} ${anvilAddress(r)}  ${ANVIL_KEYS[r]}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
