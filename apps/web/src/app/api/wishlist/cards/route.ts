import { z } from "zod";
import { prisma } from "@trestle/db";
import { productCardSelect, toCard } from "@/server/catalog";
import { parseQuery, route } from "@/server/http";

export const dynamic = "force-dynamic";

const q = z.object({
  ids: z
    .string()
    .max(4000)
    .transform((s) => s.split(",").filter(Boolean).slice(0, 100)),
});

/** Product cards for a list of ids (guest wishlists live in the browser). Only active products are returned. */
export const GET = route({ rateLimit: { bucket: "wishlist-cards", limit: 240, windowSec: 60 } }, async ({ req }) => {
  const { ids } = parseQuery(req, q);
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: productCardSelect,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return { items: rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map(toCard) };
});
