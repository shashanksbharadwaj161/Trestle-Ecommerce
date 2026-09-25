import { prisma } from "@trestle/db";
import { adminOrderAction } from "@/lib/schemas";
import { orderShareCents, refundCardPayment } from "@/server/card-checkout";
import { badRequest, conflict, notFound, parseBody, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "admin" }, async ({ params }) => {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: true,
      seller: { select: { storefrontName: true, slug: true } },
      buyer: { select: { displayName: true, email: true, walletAddress: true } },
      cardPayment: true,
      returnRequests: { orderBy: { createdAt: "desc" } },
      dispute: true,
      paymentIntents: true,
    },
  });
  if (!order) throw notFound("Order");
  const { cardPayment, ...rest } = order;
  const payment = cardPayment
    ? (({ guestAccessTokenHash: _h, lines: _l, ...p }) => p)(cardPayment)
    : null;
  return { order: { ...rest, cardPayment: payment } };
});

/** Card-order admin actions: cancel (+ refund this order's share and restock) or partial refund. */
export const POST = route<{ id: string }>(
  { auth: "admin", rateLimit: { bucket: "admin-order", limit: 30, windowSec: 60 } },
  async ({ req, params, user }) => {
    const input = await parseBody(req, adminOrderAction);
    const order = await prisma.order.findUnique({ where: { id: params.id }, include: { items: true } });
    if (!order) throw notFound("Order");
    if (order.paymentMethod !== "CARD" || !order.cardPaymentId)
      throw badRequest("Use the escrow dispute tools for stablecoin orders.");
    if (input.action === "ship" || input.action === "deliver")
      throw badRequest("Use /api/orders/<id>/fulfillment for shipping updates.");
    if (input.action === "cancel") {
      if (order.status !== "PROCESSING") throw conflict("Only paid, unshipped orders can be cancelled.");
      const { shareCents } = await orderShareCents(order.id);
      await refundCardPayment(order.cardPaymentId, shareCents, input.reason ?? "cancelled by store", `trestle:cancel:${order.id}`);
      await prisma.$transaction(async (tx) => {
        const r = await tx.order.updateMany({
          where: { id: order.id, status: "PROCESSING" },
          data: { status: "CANCELLED", stockReleased: true },
        });
        if (r.count !== 1) return;
        for (const it of order.items)
          await tx.productVariant.update({
            where: { id: it.productVariantId },
            data: { stock: { increment: it.quantity } },
          });
      });
      await prisma.auditLog.create({
        data: { actorId: user!.id, action: "order.cancel_refund", entity: "Order", entityId: order.id, data: { shareCents } },
      });
      return { ok: true, refundedCents: shareCents };
    }
    // deterministic key: a double-submit against the same refund state reuses the same Stripe refund
    const current = await prisma.cardPayment.findUniqueOrThrow({ where: { id: order.cardPaymentId } });
    const r = await refundCardPayment(
      order.cardPaymentId,
      input.amountCents,
      input.reason ?? "refund by store",
      `trestle:refund:${order.cardPaymentId}:${current.refundedCents}:${input.amountCents}`,
    );
    await prisma.auditLog.create({
      data: { actorId: user!.id, action: "order.refund", entity: "Order", entityId: order.id, data: { amountCents: input.amountCents } },
    });
    return { ok: true, ...r };
  },
);
