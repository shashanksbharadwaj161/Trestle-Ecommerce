import { z } from "zod";
import { hydrateCart } from "@/server/cart";
import { parseBody, route } from "@/server/http";

const body = z.object({
  items: z
    .array(
      z.object({ variantId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(20) }),
    )
    .max(50),
});

/** Read-only hydration of a signed-out (browser-stored) cart. */
export const POST = route(
  { rateLimit: { bucket: "cart-preview", limit: 120, windowSec: 60 } },
  async ({ req }) => {
    const { items } = await parseBody(req, body);
    return hydrateCart(items);
  },
);
