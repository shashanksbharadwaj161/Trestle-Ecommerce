import "server-only";
import { prisma, type Prisma } from "@trestle/db";
import { RETURN_WINDOW_DAYS, microsToCents } from "@trestle/shared";
import { authorizeCardPayment, refundCardPayment } from "./card-checkout";
import { badRequest, conflict, forbidden, notFound } from "./http";
import type { AuthedUser } from "./session";

type Cookies = { cookies: { get(name: string): { value: string } | undefined } };

/** Buyer (signed in) or guest-token holder of a card order. */
export async function orderForBuyer(orderId: string, user: AuthedUser | null, req: Cookies) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, returnRequests: true, cardPayment: true },
  });
  if (!order) throw notFound("Order");
  if (order.buyerId && user && order.buyerId === user.id) return order;
  if (order.cardPaymentId) {
    const { viewer } = await authorizeCardPayment(order.cardPaymentId, user, req).catch(() => ({
      viewer: null,
    }));
    if (viewer === "owner" || viewer === "guest") return order;
  }
  throw notFound("Order");
}

export function returnEligibility(order: {
  paymentMethod: string;
  status: string;
  deliveredAt: Date | null;
  shippedAt: Date | null;
}) {
  if (order.paymentMethod !== "CARD")
    return { eligible: false, reason: "Stablecoin orders are resolved through the escrow dispute flow." };
  if (order.status !== "DELIVERED")
    return { eligible: false, reason: "Returns open once your order has been delivered." };
  const from = order.deliveredAt ?? order.shippedAt;
  const deadline = from ? new Date(from.getTime() + RETURN_WINDOW_DAYS * 86_400_000) : null;
  if (deadline && deadline < new Date())
    return { eligible: false, reason: `The ${RETURN_WINDOW_DAYS}-day return window has closed.`, deadline };
  return { eligible: true, reason: null, deadline };
}

export async function createReturn(
  input: { orderId: string; items: { orderItemId: string; quantity: number }[]; reason: string; notes?: string },
  user: AuthedUser | null,
  req: Cookies,
) {
  const order = await orderForBuyer(input.orderId, user, req);
  const elig = returnEligibility(order);
  if (!elig.eligible) throw conflict(elig.reason!);
  const already = new Map<string, number>();
  for (const r of order.returnRequests.filter((r) => r.status !== "REJECTED"))
    for (const it of r.items as { orderItemId: string; quantity: number }[])
      already.set(it.orderItemId, (already.get(it.orderItemId) ?? 0) + it.quantity);
  for (const it of input.items) {
    const line = order.items.find((i) => i.id === it.orderItemId);
    if (!line) throw badRequest("Unknown item in return");
    if (it.quantity + (already.get(line.id) ?? 0) > line.quantity)
      throw conflict(`You have already requested a return for “${line.titleSnapshot}”.`);
  }
  const rr = await prisma.returnRequest.create({
    data: {
      orderId: order.id,
      userId: user?.id ?? null,
      reason: input.reason,
      notes: input.notes ?? null,
      items: input.items as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: { actorId: user?.id ?? null, action: "return.requested", entity: "ReturnRequest", entityId: rr.id },
  });
  return rr;
}

/** Default refund for returned items: item value less the order's discount share (never more than paid). */
export async function suggestedRefundCents(returnId: string) {
  const rr = await prisma.returnRequest.findUniqueOrThrow({
    where: { id: returnId },
    include: { order: { include: { items: true, cardPayment: true } } },
  });
  const p = rr.order.cardPayment;
  if (!p) return 0;
  let cents = 0;
  for (const it of rr.items as { orderItemId: string; quantity: number }[]) {
    const line = rr.order.items.find((i) => i.id === it.orderItemId);
    if (line) cents += microsToCents(line.unitPriceUsdMicros) * it.quantity;
  }
  const factor = p.subtotalCents > 0 ? (p.subtotalCents - p.discountCents) / p.subtotalCents : 1;
  return Math.min(Math.floor(cents * factor), p.totalCents - p.refundedCents);
}

export async function actOnReturn(
  returnId: string,
  action: "approve" | "reject" | "receive" | "refund",
  user: AuthedUser,
  opts: { adminNotes?: string; refundCents?: number },
) {
  const rr = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: { include: { items: true } } },
  });
  if (!rr) throw notFound("Return");
  if (user.role !== "ADMIN" && rr.order.sellerId !== user.sellerId) throw forbidden();
  const allowed: Record<string, string[]> = {
    approve: ["REQUESTED"],
    reject: ["REQUESTED", "APPROVED"],
    receive: ["APPROVED"],
    refund: ["RECEIVED", "APPROVED"],
  };
  if (!allowed[action]!.includes(rr.status))
    throw conflict(`Cannot ${action} a return that is ${rr.status.toLowerCase()}.`);
  const data: Prisma.ReturnRequestUpdateInput = { adminNotes: opts.adminNotes ?? rr.adminNotes };
  if (action === "approve") data.status = "APPROVED";
  if (action === "reject") {
    data.status = "REJECTED";
    data.resolvedAt = new Date();
  }
  if (action === "receive") {
    data.status = "RECEIVED";
    // returned goods go back into stock
    await prisma.$transaction(
      (rr.items as { orderItemId: string; quantity: number }[]).flatMap((it) => {
        const line = rr.order.items.find((i) => i.id === it.orderItemId);
        return line
          ? [
              prisma.productVariant.update({
                where: { id: line.productVariantId },
                data: { stock: { increment: it.quantity } },
              }),
            ]
          : [];
      }),
    );
  }
  if (action === "refund") {
    if (!rr.order.cardPaymentId) throw conflict("Only card orders are refunded here.");
    const amount = opts.refundCents ?? (await suggestedRefundCents(rr.id));
    if (amount <= 0) throw badRequest("Nothing left to refund.");
    await refundCardPayment(rr.order.cardPaymentId, amount, `return ${rr.id}`, `trestle:return:${rr.id}`);
    data.status = "REFUNDED";
    data.refundCents = amount;
    data.resolvedAt = new Date();
  }
  const updated = await prisma.returnRequest.update({ where: { id: rr.id }, data });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: `return.${action}`, entity: "ReturnRequest", entityId: rr.id, data: { refundCents: updated.refundCents } },
  });
  return updated;
}
