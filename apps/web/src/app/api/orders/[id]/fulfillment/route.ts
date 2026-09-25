import { prisma } from "@trestle/db";
import { shipInput } from "@/lib/schemas";
import { loadOrderFor } from "@/server/orders";
import { badRequest, conflict, forbidden, parseBody, route } from "@/server/http";

/** Seller-side, off-chain fulfilment states: ESCROWED → SHIPPED → DELIVERED (carrier reported). */
export const POST = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "order-write", limit: 60, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { order, viewer } = await loadOrderFor(params.id, user!);
    if (viewer !== "seller") throw forbidden("Only the seller can update fulfilment");
    const input = await parseBody(req, shipInput);
    if (input.action === "ship") {
      if (order.status !== "ESCROWED")
        throw conflict("Only escrowed orders can be marked as shipped");
      if (!input.trackingNumber) throw badRequest("Tracking number is required");
      // conditional update guards against racing on-chain status changes
      const res = await prisma.order.updateMany({
        where: { id: order.id, status: "ESCROWED" },
        data: { status: "SHIPPED", trackingNumber: input.trackingNumber, shippedAt: new Date() },
      });
      if (res.count !== 1) throw conflict("Order status changed — refresh and try again");
    } else {
      if (order.status !== "SHIPPED")
        throw conflict("Only shipped orders can be marked as delivered");
      const res = await prisma.order.updateMany({
        where: { id: order.id, status: "SHIPPED" },
        data: { status: "DELIVERED" },
      });
      if (res.count !== 1) throw conflict("Order status changed — refresh and try again");
    }
    await prisma.auditLog.create({
      data: {
        actorId: user!.id,
        action: `order.${input.action}`,
        entity: "Order",
        entityId: order.id,
        data: { trackingNumber: input.trackingNumber ?? null },
      },
    });
    return { ok: true };
  },
);
