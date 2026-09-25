import {
  Prisma,
  type PrismaClient,
  type OrderStatus,
  type ReputationEventType,
  type LoyaltyTxType,
} from "@prisma/client";
import { REPUTATION_EVENT_TYPES } from "@trestle/shared";
import type { ApplyResult, NormalizedEvent } from "./types";

type Tx = Prisma.TransactionClient;

const RANK: Record<OrderStatus, number> = {
  PENDING_PAYMENT: 0,
  ESCROWED: 1,
  PROCESSING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  DISPUTED: 4,
  COMPLETED: 5,
  REFUNDED: 5,
  CANCELLED: 5,
};
const TERMINAL: OrderStatus[] = ["COMPLETED", "REFUNDED", "CANCELLED"];

/** Monotonic order status transition: events can arrive late or twice, status never moves backwards. */
export function nextOrderStatus(current: OrderStatus, proposed: OrderStatus): OrderStatus {
  if (current === proposed) return current;
  // money actually reached escrow for an order we had cancelled (late fulfilment): the escrow is authoritative
  if (current === "CANCELLED" && proposed === "ESCROWED") return "ESCROWED";
  if (TERMINAL.includes(current)) return current;
  if (proposed === "CANCELLED" && current !== "PENDING_PAYMENT") return current;
  return RANK[proposed] > RANK[current] ? proposed : current;
}

const lc = (v: unknown) => String(v ?? "").toLowerCase();
const str = (v: unknown) => String(v ?? "");

export interface TimelineEntry {
  status: string;
  at: string;
  chainId?: number;
  txHash?: string;
  note?: string;
}

export function pushTimeline(
  existing: Prisma.JsonValue,
  entry: TimelineEntry,
): Prisma.InputJsonValue {
  const list = Array.isArray(existing) ? (existing as unknown as TimelineEntry[]) : [];
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined),
  ) as TimelineEntry;
  if (list.some((e) => e.status === clean.status && e.txHash === clean.txHash)) {
    return list as unknown as Prisma.InputJsonValue;
  }
  return [...list, clean] as unknown as Prisma.InputJsonValue;
}

async function userIdForAddress(tx: Tx, chainId: number, address: string): Promise<string | null> {
  const a = address.toLowerCase();
  const user = await tx.user.findUnique({ where: { walletAddress: a }, select: { id: true } });
  if (user) return user.id;
  const sa = await tx.smartAccount.findUnique({
    where: { chainId_address: { chainId, address: a } },
    select: { userId: true },
  });
  return sa?.userId ?? null;
}

async function releaseStock(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.stockReleased) return;
  for (const item of order.items) {
    await tx.productVariant.update({
      where: { id: item.productVariantId },
      data: { stock: { increment: item.quantity } },
    });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockReleased: true } });
}

async function advanceOrder(
  tx: Tx,
  orderId: string,
  proposed: OrderStatus,
  data: Prisma.OrderUpdateInput = {},
) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return;
  const status = nextOrderStatus(order.status, proposed);
  await tx.order.update({ where: { id: orderId }, data: { ...data, status } });
}

async function orderByEscrowId(tx: Tx, chainId: number, escrowOrderId: string) {
  return tx.order.findUnique({
    where: {
      escrowChainId_escrowContractOrderId: {
        escrowChainId: chainId,
        escrowContractOrderId: escrowOrderId,
      },
    },
  });
}

async function intentForOrderRef(tx: Tx, orderRef: string, kind?: "DIRECT" | "CROSS_CHAIN") {
  const order = await tx.order.findUnique({ where: { onchainRef: lc(orderRef) } });
  if (!order) return { order: null, intent: null };
  const intent = await tx.paymentIntent.findFirst({
    where: { orderId: order.id, ...(kind ? { routeKind: kind } : {}), status: { not: "FAILED" } },
    orderBy: { createdAt: "desc" },
  });
  return { order, intent };
}

/**
 * Applies one decoded contract event to Postgres exactly once.
 * Idempotency: the ChainEvent row (unique on chainId+txHash+logIndex) is written in the same transaction as
 * the state change; a duplicate delivery is detected up-front, and a concurrent duplicate fails the unique
 * constraint and rolls back.
 */
export async function applyChainEvent(
  prisma: PrismaClient,
  evt: NormalizedEvent,
): Promise<ApplyResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const exists = await tx.chainEvent.findUnique({
        where: {
          chainId_txHash_logIndex: {
            chainId: evt.chainId,
            txHash: lc(evt.txHash),
            logIndex: evt.logIndex,
          },
        },
        select: { id: true },
      });
      if (exists) return { status: "duplicate", eventName: evt.eventName } satisfies ApplyResult;
      await tx.chainEvent.create({
        data: {
          chainId: evt.chainId,
          contract: evt.contract,
          address: lc(evt.address),
          eventName: evt.eventName,
          txHash: lc(evt.txHash),
          logIndex: evt.logIndex,
          blockNumber: BigInt(evt.blockNumber),
          blockTime: evt.blockTime ? new Date(evt.blockTime) : null,
          args: evt.args as Prisma.InputJsonValue,
        },
      });
      const note = await handle(tx, evt);
      return {
        status: note === "ignored" ? "ignored" : "applied",
        eventName: evt.eventName,
        note,
      } satisfies ApplyResult;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "duplicate", eventName: evt.eventName };
    }
    throw err;
  }
}

export async function applyChainEvents(
  prisma: PrismaClient,
  events: NormalizedEvent[],
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const e of events) results.push(await applyChainEvent(prisma, e));
  return results;
}

async function handle(tx: Tx, evt: NormalizedEvent): Promise<string | undefined> {
  const a = evt.args;
  const at = evt.blockTime ?? new Date().toISOString();
  const txHash = lc(evt.txHash);

  switch (`${evt.contract}.${evt.eventName}`) {
    // ------------------------------------------------------------------ payment router
    case "paymentRouter.IntentCreated": {
      const { order } = await intentForOrderRef(tx, str(a.orderRef));
      if (!order) return "ignored";
      const intentId = lc(a.intentId);
      const already = await tx.paymentIntent.findUnique({ where: { onchainIntentId: intentId } });
      if (already) return undefined;
      const intent = await tx.paymentIntent.findFirst({
        where: {
          orderId: order.id,
          routeKind: "CROSS_CHAIN",
          sourceChainId: evt.chainId,
          onchainIntentId: null,
          status: "CREATED",
        },
        orderBy: { createdAt: "desc" },
      });
      if (!intent) return "ignored"; // unexpected second intent for the order — the relayer refunds it
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          onchainIntentId: intentId,
          onchainNonce: str(a.nonce),
          sourceTxHash: txHash,
          feeAmount: str(a.fee),
          txHashes: pushTimeline(intent.txHashes, {
            status: "CREATED",
            at,
            chainId: evt.chainId,
            txHash,
          }),
        },
      });
      return undefined;
    }
    case "paymentRouter.IntentFulfilled": {
      const intentId = lc(a.intentId);
      let intent = await tx.paymentIntent.findUnique({ where: { onchainIntentId: intentId } });
      if (!intent) intent = (await intentForOrderRef(tx, str(a.orderRef), "CROSS_CHAIN")).intent;
      if (!intent) return "ignored";
      const escrowOrderId = str(a.escrowOrderId);
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "FULFILLED",
          onchainIntentId: intent.onchainIntentId ?? intentId,
          fulfillTxHash: txHash,
          escrowOrderId,
          lastError: null,
          txHashes: pushTimeline(intent.txHashes, {
            status: "FULFILLED",
            at,
            chainId: evt.chainId,
            txHash,
          }),
        },
      });
      await advanceOrder(tx, intent.orderId, "ESCROWED", {
        escrowChainId: evt.chainId,
        escrowContractOrderId: escrowOrderId,
      });
      return undefined;
    }
    case "paymentRouter.IntentSettled": {
      const intent = await tx.paymentIntent.findUnique({
        where: { onchainIntentId: lc(a.intentId) },
      });
      if (!intent) return "ignored";
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          settleTxHash: txHash,
          txHashes: pushTimeline(intent.txHashes, {
            status: "SETTLED",
            at,
            chainId: evt.chainId,
            txHash,
            note: "solver repaid on source chain",
          }),
        },
      });
      return undefined;
    }
    case "paymentRouter.IntentFailed": {
      const intent = await tx.paymentIntent.findUnique({
        where: { onchainIntentId: lc(a.intentId) },
      });
      if (!intent) return "ignored";
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "FAILED",
          failTxHash: txHash,
          failureReason: str(a.reason),
          txHashes: pushTimeline(intent.txHashes, {
            status: "FAILED",
            at,
            chainId: evt.chainId,
            txHash,
            note: `refunded: ${str(a.reason)}`,
          }),
        },
      });
      const order = await tx.order.findUnique({ where: { id: intent.orderId } });
      if (order && order.status === "PENDING_PAYMENT") {
        await advanceOrder(tx, order.id, "CANCELLED");
        await releaseStock(tx, order.id);
      }
      return undefined;
    }
    case "paymentRouter.DirectCheckout": {
      const { intent } = await intentForOrderRef(tx, str(a.orderRef), "DIRECT");
      if (!intent) return "ignored";
      const escrowOrderId = str(a.escrowOrderId);
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "FULFILLED",
          sourceTxHash: txHash,
          fulfillTxHash: txHash,
          escrowOrderId,
          feeAmount: str(a.fee),
          txHashes: pushTimeline(intent.txHashes, {
            status: "FULFILLED",
            at,
            chainId: evt.chainId,
            txHash,
            note: "paid directly into escrow",
          }),
        },
      });
      await advanceOrder(tx, intent.orderId, "ESCROWED", {
        escrowChainId: evt.chainId,
        escrowContractOrderId: escrowOrderId,
      });
      return undefined;
    }

    // ------------------------------------------------------------------ escrow
    case "escrow.OrderCreated": {
      const order = await tx.order.findUnique({ where: { onchainRef: lc(a.ref) } });
      if (!order) return "ignored";
      await advanceOrder(tx, order.id, "ESCROWED", {
        escrowChainId: evt.chainId,
        escrowContractOrderId: str(a.orderId),
        buyerAccount: lc(a.buyer),
        deliveryDeadline: new Date(Number(a.deliveryDeadline) * 1000),
      });
      return undefined;
    }
    case "escrow.DeliveryConfirmed": {
      const order = await orderByEscrowId(tx, evt.chainId, str(a.orderId));
      if (!order) return "ignored";
      await advanceOrder(tx, order.id, "DELIVERED");
      return undefined;
    }
    case "escrow.FundsReleased": {
      const order = await orderByEscrowId(tx, evt.chainId, str(a.orderId));
      if (!order) return "ignored";
      await advanceOrder(tx, order.id, "COMPLETED", { completedAt: new Date(at) });
      return undefined;
    }
    case "escrow.DisputeRaised": {
      const order = await orderByEscrowId(tx, evt.chainId, str(a.orderId));
      if (!order) return "ignored";
      const raisedBy = lc(a.raisedBy);
      const raisedById = await userIdForAddress(tx, evt.chainId, raisedBy);
      await tx.dispute.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          raisedByAddress: raisedBy,
          raisedById,
          reason: str(a.reason) || "(no reason given)",
          raiseTxHash: txHash,
        },
        update: {
          raiseTxHash: txHash,
          raisedByAddress: raisedBy,
          raisedById: raisedById ?? undefined,
        },
      });
      await advanceOrder(tx, order.id, "DISPUTED");
      return undefined;
    }
    case "escrow.DisputeResolved": {
      const order = await orderByEscrowId(tx, evt.chainId, str(a.orderId));
      if (!order) return "ignored";
      const bps = Number(a.buyerShareBps);
      const resolvedById = await userIdForAddress(tx, evt.chainId, lc(a.arbiter));
      await tx.dispute.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          raisedByAddress: order.buyerAccount ?? "",
          reason: "(dispute raised before indexing)",
          status: "RESOLVED",
          buyerShareBps: bps,
          resolveTxHash: txHash,
          resolvedById,
          resolvedAt: new Date(at),
        },
        update: {
          status: "RESOLVED",
          buyerShareBps: bps,
          resolveTxHash: txHash,
          resolvedById: resolvedById ?? undefined,
          resolvedAt: new Date(at),
        },
      });
      await advanceOrder(tx, order.id, bps === 10_000 ? "REFUNDED" : "COMPLETED", {
        completedAt: new Date(at),
      });
      return undefined;
    }
    case "escrow.OrderRefunded": {
      const order = await orderByEscrowId(tx, evt.chainId, str(a.orderId));
      if (!order) return "ignored";
      await tx.dispute.updateMany({
        where: { orderId: order.id, status: "OPEN" },
        data: {
          status: "RESOLVED",
          buyerShareBps: 10_000,
          resolutionNotes: "Seller refunded the buyer in full.",
          resolveTxHash: txHash,
          resolvedAt: new Date(at),
        },
      });
      await advanceOrder(tx, order.id, "REFUNDED", { completedAt: new Date(at) });
      return undefined;
    }

    // ------------------------------------------------------------------ reputation & loyalty
    case "reputation.ReputationEventRecorded": {
      const address = lc(a.user);
      const userId = await userIdForAddress(tx, evt.chainId, address);
      const typeIdx = Number(a.eventType);
      const eventType = (REPUTATION_EVENT_TYPES[typeIdx] ??
        "PURCHASE_COMPLETED") as ReputationEventType;
      const newScore = scaledToDecimal(str(a.newScore));
      await tx.reputationEvent.create({
        data: {
          userId,
          address,
          chainId: evt.chainId,
          eventType,
          weight: Number(a.weight),
          newScore,
          txHash,
          logIndex: evt.logIndex,
          blockNumber: BigInt(evt.blockNumber),
          createdAt: new Date(at),
        },
      });
      if (userId) await refreshReputationCache(tx, userId);
      return undefined;
    }
    case "loyalty.RewardMinted":
    case "loyalty.Staked":
    case "loyalty.Unstaked":
    case "loyalty.RewardsClaimed": {
      const map: Record<string, LoyaltyTxType> = {
        RewardMinted: "EARNED",
        Staked: "STAKED",
        Unstaked: "UNSTAKED",
        RewardsClaimed: "CLAIMED",
      };
      const address = lc(a.to ?? a.user);
      const userId = await userIdForAddress(tx, evt.chainId, address);
      await tx.loyaltyTransaction.create({
        data: {
          userId,
          address,
          chainId: evt.chainId,
          type: map[evt.eventName]!,
          amount: str(a.amount),
          txHash,
          logIndex: evt.logIndex,
          createdAt: new Date(at),
        },
      });
      return undefined;
    }

    // ------------------------------------------------------------------ authenticity
    case "authenticity.CertificateMinted": {
      const productId = str(a.productId);
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) return "ignored";
      await tx.authenticityCertificate.upsert({
        where: {
          chainId_contractAddress_tokenId: {
            chainId: evt.chainId,
            contractAddress: lc(evt.address),
            tokenId: str(a.tokenId),
          },
        },
        create: {
          productId,
          tokenId: str(a.tokenId),
          contractAddress: lc(evt.address),
          chainId: evt.chainId,
          mintTxHash: txHash,
          minter: lc(a.seller),
          ownerAddress: lc(a.to),
          batch: str(a.batch) || null,
          metadataUri: "",
        },
        update: { mintTxHash: txHash, batch: str(a.batch) || undefined },
      });
      return undefined;
    }
    case "authenticity.ProvenanceRecorded": {
      await tx.authenticityCertificate.updateMany({
        where: { chainId: evt.chainId, contractAddress: lc(evt.address), tokenId: str(a.tokenId) },
        data: { ownerAddress: lc(a.to) },
      });
      return undefined;
    }
    default:
      return undefined; // stored in ChainEvent for the transparency dashboard only
  }
}

/**
 * Reputation lives per chain and per account (EOA + smart accounts). The cached user score is the sum of the
 * latest recorded score of every (chain, address) pair the user owns. (Decay since that event is applied
 * when the live score is read from the contract.)
 */
async function refreshReputationCache(tx: Tx, userId: string) {
  const rows = await tx.$queryRaw<{ total: string | null }[]>`
    SELECT SUM(latest."newScore")::text AS total FROM (
      SELECT DISTINCT ON ("chainId", address) "newScore"
      FROM "ReputationEvent"
      WHERE "userId" = ${userId} AND "isSeedDemo" = false
      ORDER BY "chainId", address, "blockNumber" DESC, "logIndex" DESC
    ) latest`;
  await tx.user.update({
    where: { id: userId },
    data: { reputationScoreCache: rows[0]?.total ?? "0" },
  });
}

/** 1e18-scaled signed integer string → Decimal string with 6 fraction digits (exact truncation). */
export function scaledToDecimal(value: string): string {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n) / 10n ** 12n;
  return `${neg ? "-" : ""}${whole}.${frac.toString().padStart(6, "0")}`;
}
