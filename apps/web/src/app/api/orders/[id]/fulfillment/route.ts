import { prisma } from "@trestle/db";
import { adminOrderAction, shipInput } from "@/lib/schemas";
import { loadOrderFor } from "@/server/orders";
import { badRequest, conflict, forbidden, parseBody, route } from "@/server/http";
import { z } from "zod";

const body = z.union([
  adminOrderAction.options[0],
  adminOrderAction.options[1],
  shipInput,
]);

/**
 * Off-chain fulfilment states, by the seller (or an admin):
 *   crypto orders: ESCROWED → SHIPPED → DELIVERED (escrow release stays on-chain)
 *   card orders:   PROCESSING → SHIPPED → DELIVERED
 */
export const POST = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "order-write", limit: 60, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { order, viewer } = await loadOrderFor(params.id, user!);
    if (viewer !== "seller" && viewer !== "admin")
      throw forbidden("Only the seller can update fulfilment");
    const input = await parseBody(req, body);
    const shipFrom = order.paymentMethod === "CARD" ? "PROCESSING" : "ESCROWED";
    if (input.action === "ship") {
      if (order.status !== shipFrom)
        throw conflict(
          order.paymentMethod === "CARD"
            ? "Only paid orders that have not shipped can be marked as shipped"
            : "Only escrowed orders can be marked as shipped",
        );
      if (!input.trackingNumber) throw badRequest("Tracking number is required");
      const carrier = "carrier" in input ? input.carrier : null;
      const trackingUrl = "trackingUrl" in input ? (input.trackingUrl ?? null) : null;
      // conditional update guards against racing webhook / on-chain status changes
      const res = await prisma.order.updateMany({
        where: { id: order.id, status: shipFrom },
        data: {
          status: "SHIPPED",
          trackingNumber: input.trackingNumber,
          carrier,
          trackingUrl,
          shippedAt: new Date(),
        },
      });
      if (res.count !== 1) throw conflict("Order status changed — refresh and try again");
    } else {
      if (order.status !== "SHIPPED")
        throw conflict("Only shipped orders can be marked as delivered");
      const res = await prisma.order.updateMany({
        where: { id: order.id, status: "SHIPPED" },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      if (res.count !== 1) throw conflict("Order status changed — refresh and try again");
    }
    await prisma.auditLog.create({
      data: {
        actorId: user!.id,
        action: `order.${input.action}`,
        entity: "Order",
        entityId: order.id,
        data: { trackingNumber: "trackingNumber" in input ? (input.trackingNumber ?? null) : null },
      },
    });
    return { ok: true };
  },
);
