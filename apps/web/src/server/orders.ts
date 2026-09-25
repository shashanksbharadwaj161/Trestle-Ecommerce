import "server-only";
import { prisma, type OrderStatus, type Prisma } from "@trestle/db";
import { ESCROW_STATUS } from "@trestle/shared";
import { trestleEscrowAbi, trestlePaymentRouterAbi } from "@trestle/shared/abis";
import { deployment, publicClient } from "./chain";
import { notFound } from "./http";
import type { AuthedUser } from "./session";

export const orderDetailInclude = {
  items: { include: { product: { select: { id: true, images: true, title: true } } } },
  seller: { include: { user: { select: { id: true, walletAddress: true, displayName: true } } } },
  buyer: { select: { id: true, walletAddress: true, displayName: true } },
  paymentIntents: { orderBy: { createdAt: "asc" } },
  dispute: { include: { resolvedBy: { select: { displayName: true, walletAddress: true } } } },
  review: true,
  cardPayment: {
    select: { id: true, status: true, totalCents: true, refundedCents: true, shippingMethod: true },
  },
  returnRequests: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export type Viewer = "buyer" | "seller" | "admin";

export async function loadOrderFor(
  orderId: string,
  user: AuthedUser,
): Promise<{ order: OrderDetail; viewer: Viewer }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderDetailInclude,
  });
  if (!order) throw notFound("Order");
  let viewer: Viewer | null = null;
  if (order.buyerId === user.id) viewer = "buyer";
  else if (order.seller.userId === user.id) viewer = "seller";
  else if (user.role === "ADMIN") viewer = "admin";
  // don't reveal that someone else's order exists
  if (!viewer) throw notFound("Order");
  return { order, viewer };
}

export interface OnchainEscrow {
  status: (typeof ESCROW_STATUS)[number];
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  deliveryDeadline: number;
}

export async function readEscrow(order: {
  escrowChainId: number | null;
  escrowContractOrderId: string | null;
}): Promise<OnchainEscrow | null> {
  if (!order.escrowChainId || !order.escrowContractOrderId) return null;
  const dep = deployment(order.escrowChainId);
  if (!dep) return null;
  try {
    const o = (await publicClient(order.escrowChainId).readContract({
      address: dep.escrow,
      abi: trestleEscrowAbi,
      functionName: "getOrder",
      args: [BigInt(order.escrowContractOrderId)],
    })) as {
      buyer: string;
      seller: string;
      token: string;
      amount: bigint;
      deliveryDeadline: bigint;
      status: number;
    };
    return {
      status: ESCROW_STATUS[o.status] ?? "None",
      buyer: o.buyer.toLowerCase(),
      seller: o.seller.toLowerCase(),
      token: o.token.toLowerCase(),
      amount: o.amount.toString(),
      deliveryDeadline: Number(o.deliveryDeadline),
    };
  } catch {
    return null;
  }
}

export async function readIntentStatus(intent: {
  sourceChainId: number;
  onchainIntentId: string | null;
}) {
  if (!intent.onchainIntentId) return null;
  const dep = deployment(intent.sourceChainId);
  if (!dep) return null;
  try {
    const i = (await publicClient(intent.sourceChainId).readContract({
      address: dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "getIntent",
      args: [intent.onchainIntentId as `0x${string}`],
    })) as { status: number; expiry: bigint };
    return {
      status: ["None", "Created", "Settled", "Failed"][i.status] ?? "None",
      expiry: Number(i.expiry),
    };
  } catch {
    return null;
  }
}

export interface OrderActions {
  confirmDelivery?: { via: "smart" | "wallet" };
  raiseDispute?: { via: "smart" | "wallet" };
  review?: boolean;
  markShipped?: boolean;
  markDelivered?: boolean;
  sellerRefund?: boolean;
  refundExpiredIntent?: { intentId: string; chainId: number };
  payNow?: { paymentIntentId: string };
}

const ACTIVE_ESCROW: OrderStatus[] = ["ESCROWED", "SHIPPED", "DELIVERED"];

export function computeActions(
  order: OrderDetail,
  viewer: Viewer,
  user: AuthedUser,
  escrow: OnchainEscrow | null,
  now = Date.now(),
): OrderActions {
  const a: OrderActions = {};
  if (order.paymentMethod === "CARD") {
    // card orders: fulfilment only; payment state lives on CardPayment (webhook-driven)
    if (viewer === "seller" || viewer === "admin") {
      if (order.status === "PROCESSING") a.markShipped = true;
      if (order.status === "SHIPPED") a.markDelivered = true;
    }
    return a;
  }
  const escrowOpen = escrow ? escrow.status === "Created" : ACTIVE_ESCROW.includes(order.status);
  const beforeDeadline = escrow ? now / 1000 <= escrow.deliveryDeadline : true;
  const via: "smart" | "wallet" =
    order.buyerAccount && order.buyerAccount === user.walletAddress ? "wallet" : "smart";
  if (viewer === "buyer" && !order.isSeedDemo) {
    if (escrowOpen && ACTIVE_ESCROW.includes(order.status)) {
      a.confirmDelivery = { via };
      if (beforeDeadline) a.raiseDispute = { via };
    }
    if (order.status === "COMPLETED" && !order.review) a.review = true;
    const pending = order.paymentIntents.find(
      (i) => i.status === "CREATED" && !i.onchainIntentId && !i.sourceTxHash,
    );
    if (
      order.status === "PENDING_PAYMENT" &&
      pending &&
      pending.expiresAt.getTime() > now + 5 * 60_000
    ) {
      a.payNow = { paymentIntentId: pending.id };
    }
  }
  if (viewer === "buyer" && order.isSeedDemo && order.status === "COMPLETED" && !order.review)
    a.review = true;
  if (viewer === "seller") {
    if (order.status === "ESCROWED") a.markShipped = true;
    if (order.status === "SHIPPED") a.markDelivered = true;
    if (
      !order.isSeedDemo &&
      (escrowOpen || escrow?.status === "Disputed") &&
      ["ESCROWED", "SHIPPED", "DELIVERED", "DISPUTED"].includes(order.status)
    ) {
      a.sellerRefund = true;
    }
  }
  for (const i of order.paymentIntents) {
    if (
      i.routeKind === "CROSS_CHAIN" &&
      i.status !== "FAILED" &&
      i.status !== "FULFILLED" &&
      i.onchainIntentId
    ) {
      if (i.expiresAt.getTime() + 30 * 60_000 < now)
        a.refundExpiredIntent = { intentId: i.onchainIntentId, chainId: i.sourceChainId };
    }
  }
  return a;
}

export async function listOrders(
  user: AuthedUser,
  as: "buyer" | "seller",
  opts: { status?: OrderStatus; take?: number; cursor?: string } = {},
) {
  const where: Prisma.OrderWhereInput =
    as === "buyer" ? { buyerId: user.id } : { seller: { userId: user.id } };
  // abandoned / unpaid card checkouts are not orders from the shopper's point of view
  where.NOT = { paymentMethod: "CARD", cardPayment: { status: { in: ["OPEN", "EXPIRED", "FAILED"] } } };
  if (opts.status) where.status = opts.status;
  const take = Math.min(opts.take ?? 20, 50);
  const rows = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      items: { include: { product: { select: { images: true } } } },
      seller: { select: { storefrontName: true, slug: true } },
      buyer: { select: { displayName: true, walletAddress: true } },
      paymentIntents: {
        select: { routeKind: true, status: true, sourceChainId: true, destChainId: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      dispute: { select: { status: true } },
      cardPayment: { select: { id: true, status: true, totalCents: true } },
      returnRequests: { select: { id: true, status: true } },
    },
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
