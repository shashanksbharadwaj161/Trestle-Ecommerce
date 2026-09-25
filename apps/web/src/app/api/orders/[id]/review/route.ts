import { prisma } from "@trestle/db";
import { reviewInput } from "@/lib/schemas";
import { loadOrderFor } from "@/server/orders";
import { conflict, forbidden, parseBody, route } from "@/server/http";

/** One verified review per completed order (enforced by a unique index on Review.orderId). */
export const POST = route<{ id: string }>(
  { auth: "user", rateLimit: { bucket: "review", limit: 10, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { order, viewer } = await loadOrderFor(params.id, user!);
    if (viewer !== "buyer") throw forbidden("Only the buyer can review this order");
    if (order.status !== "COMPLETED") throw conflict("You can review an order once it is completed");
    if (order.review) throw conflict("You have already reviewed this order");
    const input = await parseBody(req, reviewInput);
    const productId = order.items[0]!.productId;
    try {
      const review = await prisma.review.create({
        data: { orderId: order.id, productId, authorId: user!.id, rating: input.rating, title: input.title, text: input.text, verifiedPurchase: true },
      });
      return { review };
    } catch {
      throw conflict("You have already reviewed this order");
    }
  },
);
