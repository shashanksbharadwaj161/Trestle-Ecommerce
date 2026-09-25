import { encodeAbiParameters, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  prisma as defaultPrisma,
  type PrismaClient,
  type PaymentIntent,
  type Prisma,
} from "@trestle/db";
import { fetchTransactionEvents, pushTimeline } from "@trestle/db/sync";
import {
  findToken,
  fulfillMessageTypes,
  fulfillmentReceiptTypes,
  intentCoversPayout,
  routerDomain,
  type FulfillMessage,
  type FulfillmentReceipt,
} from "@trestle/shared";
import { trestlePaymentRouterAbi } from "@trestle/shared/abis";
import type { RelayerConfig } from "./config";
import type { ChainCtx } from "./clients";
import { deliverEvents } from "./deliver";
import { log } from "./log";

type Prisma_ = PrismaClient;

interface OnchainIntent {
  buyer: `0x${string}`;
  sourceToken: `0x${string}`;
  sourceAmount: bigint;
  fee: bigint;
  destChainId: bigint;
  destToken: `0x${string}`;
  destAmount: bigint;
  seller: `0x${string}`;
  destBuyer: `0x${string}`;
  orderRef: Hex;
  deliveryWindow: bigint;
  expiry: bigint;
  nonce: bigint;
  status: number; // 0 None, 1 Created, 2 Settled, 3 Failed
}

const STATUS = { None: 0, Created: 1, Settled: 2, Failed: 3 } as const;
const FULFILL_SAFETY_SECONDS = 60n;

export class IntentProcessor {
  private attester;
  constructor(
    private cfg: RelayerConfig,
    private chains: Map<number, ChainCtx>,
    private prisma: Prisma_ = defaultPrisma,
  ) {
    this.attester = privateKeyToAccount(cfg.attesterKey);
  }

  private chain(id: number): ChainCtx {
    const c = this.chains.get(id);
    if (!c) throw new Error(`unsupported chain ${id}`);
    return c;
  }

  async readIntent(sourceChainId: number, intentId: Hex): Promise<OnchainIntent> {
    const src = this.chain(sourceChainId);
    return (await src.client.readContract({
      address: src.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "getIntent",
      args: [intentId],
    })) as unknown as OnchainIntent;
  }

  /** Sends a relayer tx, waits for it, and immediately delivers its events so the UI reflects the result. */
  private async send(ctx: ChainCtx, functionName: string, args: readonly unknown[]): Promise<Hex> {
    const { request } = await ctx.client.simulateContract({
      address: ctx.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: functionName as never,
      args: args as never,
      account: ctx.wallet.account,
    });
    const hash = await ctx.wallet.writeContract(request as never);
    const receipt = await ctx.client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
    const { events } = await fetchTransactionEvents(ctx.client, this.cfg.mode, ctx.chainId, hash);
    await deliverEvents(this.cfg, this.prisma, events);
    return hash;
  }

  private async note(
    intent: PaymentIntent,
    data: Prisma.PaymentIntentUpdateInput,
    timeline?: { status: string; note?: string; chainId?: number; txHash?: string },
  ) {
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        ...data,
        ...(timeline
          ? {
              txHashes: pushTimeline(intent.txHashes, {
                at: new Date().toISOString(),
                ...timeline,
              }),
            }
          : {}),
      },
    });
  }

  /** Refund the buyer on the source chain (relayer-initiated), recording why. */
  async fail(sourceChainId: number, intentId: Hex, reason: string) {
    const src = this.chain(sourceChainId);
    const onchain = await this.readIntent(sourceChainId, intentId);
    if (onchain.status !== STATUS.Created) return null;
    const hash = await this.send(src, "failIntent", [intentId, reason.slice(0, 120)]);
    log.warn("intent failed & refunded", { intentId, reason, tx: hash });
    return hash;
  }

  /** Validates the on-chain intent against the server-issued quote/order before fulfilling it. */
  private async validate(intent: PaymentIntent, onchain: OnchainIntent): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: intent.orderId },
      include: { seller: true },
    });
    if (!order) return "unknown order";
    if (order.status === "CANCELLED") return "order was cancelled";
    const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    if (!eq(onchain.orderRef, order.onchainRef)) return "order reference mismatch";
    if (!eq(onchain.sourceToken, intent.sourceToken)) return "source token mismatch";
    if (onchain.sourceAmount < BigInt(intent.sourceAmount.toFixed()))
      return "source amount below quote";
    if (Number(onchain.destChainId) !== intent.destChainId) return "destination chain mismatch";
    if (!eq(onchain.destToken, intent.destToken)) return "destination token mismatch";
    if (onchain.destAmount !== BigInt(intent.destAmount.toFixed())) return "payout amount mismatch";
    if (!eq(onchain.seller, order.seller.payoutAddress)) return "seller address mismatch";
    if (!eq(onchain.destBuyer, intent.destBuyer)) return "buyer account mismatch";
    if (Number(onchain.deliveryWindow) !== intent.deliveryWindowSec)
      return "delivery window mismatch";
    const payToken = findToken(this.cfg.mode, intent.sourceChainId, onchain.sourceToken);
    const payoutToken = findToken(this.cfg.mode, intent.destChainId, onchain.destToken);
    if (!payToken || !payoutToken) return "unsupported token";
    const econ = intentCoversPayout({
      sourceAmount: onchain.sourceAmount,
      fee: onchain.fee,
      payToken,
      destAmount: onchain.destAmount,
      payoutToken,
      prices: this.cfg.prices,
      toleranceBps: this.cfg.priceToleranceBps,
    });
    if (!econ.ok)
      return `payment no longer covers payout at current prices (net $${econ.netUsd} < $${econ.payoutUsd} µUSD)`;
    return null;
  }

  private async fulfill(intent: PaymentIntent, onchain: OnchainIntent): Promise<bigint> {
    const dest = this.chain(intent.destChainId);
    const src = this.chain(intent.sourceChainId);
    const intentId = intent.onchainIntentId as Hex;
    const existing = (await dest.client.readContract({
      address: dest.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "fulfilledIntents",
      args: [intentId],
    })) as bigint;
    if (existing !== 0n) return existing; // already fulfilled (e.g. crash before we recorded it) — never twice

    const liquidity = (await dest.client.readContract({
      address: dest.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "solverLiquidity",
      args: [dest.wallet.account.address, onchain.destToken],
    })) as bigint;
    if (liquidity < onchain.destAmount) {
      throw new NonRetryable(
        `insufficient destination liquidity (${liquidity} < ${onchain.destAmount})`,
      );
    }
    const message: FulfillMessage = {
      intentId,
      nonce: onchain.nonce,
      sourceChainId: BigInt(intent.sourceChainId),
      sourceRouter: src.dep.paymentRouter,
      destChainId: BigInt(intent.destChainId),
      buyer: onchain.destBuyer,
      seller: onchain.seller,
      destToken: onchain.destToken,
      destAmount: onchain.destAmount,
      orderRef: onchain.orderRef,
      deliveryWindow: onchain.deliveryWindow,
      expiry: onchain.expiry,
    };
    // attestation is bound (EIP-712 domain) to the destination chain id + router address
    const signature = await this.attester.signTypedData({
      domain: routerDomain(intent.destChainId, dest.dep.paymentRouter),
      types: fulfillMessageTypes,
      primaryType: "FulfillMessage",
      message,
    });
    const proof = encodeAbiParameters([{ type: "bytes[]" }], [[signature]]);
    await this.note(
      intent,
      { status: "ROUTING" },
      {
        status: "ROUTING",
        chainId: intent.destChainId,
        note: `attested by ${this.attester.address}`,
      },
    );
    const hash = await this.send(dest, "fulfillIntent", [message, proof]);
    log.info("intent fulfilled", { intentId, destChainId: intent.destChainId, tx: hash });
    return (await dest.client.readContract({
      address: dest.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "fulfilledIntents",
      args: [intentId],
    })) as bigint;
  }

  async settle(intent: PaymentIntent) {
    const src = this.chain(intent.sourceChainId);
    const dest = this.chain(intent.destChainId);
    const intentId = intent.onchainIntentId as Hex;
    const onchain = await this.readIntent(intent.sourceChainId, intentId);
    if (onchain.status !== STATUS.Created) return;
    const escrowOrderId = (await dest.client.readContract({
      address: dest.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "fulfilledIntents",
      args: [intentId],
    })) as bigint;
    if (escrowOrderId === 0n) return; // not fulfilled — nothing to settle
    const receipt: FulfillmentReceipt = {
      intentId,
      destChainId: BigInt(intent.destChainId),
      destRouter: dest.dep.paymentRouter,
      escrowOrderId,
      solver: dest.wallet.account.address,
    };
    const signature = await this.attester.signTypedData({
      domain: routerDomain(intent.sourceChainId, src.dep.paymentRouter),
      types: fulfillmentReceiptTypes,
      primaryType: "FulfillmentReceipt",
      message: receipt,
    });
    const proof = encodeAbiParameters([{ type: "bytes[]" }], [[signature]]);
    const hash = await this.send(src, "settleIntent", [receipt, proof]);
    log.info("intent settled (solver repaid on source)", { intentId, tx: hash });
  }

  /** One pass over every cross-chain intent that needs work. */
  async processPending() {
    const now = new Date();
    const pending = await this.prisma.paymentIntent.findMany({
      where: {
        routeKind: "CROSS_CHAIN",
        onchainIntentId: { not: null },
        status: { in: ["CREATED", "ROUTING"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    for (const intent of pending) await this.processOne(intent);

    const unsettled = await this.prisma.paymentIntent.findMany({
      where: {
        routeKind: "CROSS_CHAIN",
        status: "FULFILLED",
        settleTxHash: null,
        onchainIntentId: { not: null },
      },
      take: 20,
    });
    for (const intent of unsettled) {
      try {
        await this.settle(intent);
      } catch (err) {
        log.error("settle failed", {
          intentId: intent.onchainIntentId,
          err: (err as Error).message,
        });
      }
    }
    await this.refundOrphans();
  }

  async processOne(intent: PaymentIntent) {
    const intentId = intent.onchainIntentId as Hex;
    try {
      if (!this.chains.has(intent.sourceChainId) || !this.chains.has(intent.destChainId)) {
        throw new NonRetryable("unsupported chain pair");
      }
      const onchain = await this.readIntent(intent.sourceChainId, intentId);
      if (onchain.status !== STATUS.Created) return; // settled/failed on-chain; the indexer syncs the DB
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (nowSec + FULFILL_SAFETY_SECONDS > onchain.expiry)
        throw new NonRetryable("intent expired before it could be fulfilled");
      const problem = await this.validate(intent, onchain);
      if (problem) throw new NonRetryable(problem);
      await this.fulfill(intent, onchain);
      const fresh = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
      await this.settle(fresh);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const attempts = intent.relayAttempts + 1;
      if (err instanceof NonRetryable || attempts >= this.cfg.maxAttempts) {
        await this.note(intent, {
          relayAttempts: attempts,
          lastError: message,
          nextAttemptAt: null,
        });
        try {
          await this.fail(
            intent.sourceChainId,
            intentId,
            err instanceof NonRetryable ? message : "relay failed after retries",
          );
        } catch (failErr) {
          log.error("could not refund intent", { intentId, err: (failErr as Error).message });
          await this.note(intent, { nextAttemptAt: new Date(Date.now() + 60_000) });
        }
        return;
      }
      const backoff = Math.min(300_000, 5_000 * 2 ** (attempts - 1));
      await this.note(intent, {
        relayAttempts: attempts,
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoff),
      });
      log.warn("intent attempt failed; will retry", {
        intentId,
        attempts,
        backoffMs: backoff,
        err: message,
      });
    }
  }

  /** Intents created on-chain without a matching Trestle order (e.g. crafted by hand) are refunded. */
  private async refundOrphans() {
    const created = await this.prisma.chainEvent.findMany({
      where: {
        eventName: "IntentCreated",
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const e of created) {
      const intentId = String((e.args as Record<string, unknown>).intentId).toLowerCase() as Hex;
      const known = await this.prisma.paymentIntent.findUnique({
        where: { onchainIntentId: intentId },
        select: { id: true },
      });
      if (known) continue;
      if (!this.chains.has(e.chainId)) continue;
      const age = Date.now() - e.createdAt.getTime();
      if (age < 20_000) continue; // give the matching indexer pass a moment
      try {
        const onchain = await this.readIntent(e.chainId, intentId);
        if (onchain.status === STATUS.Created)
          await this.fail(e.chainId, intentId, "no matching Trestle order");
      } catch (err) {
        log.warn("orphan refund failed", { intentId, err: (err as Error).message });
      }
    }
  }
}

export class NonRetryable extends Error {}
