import { z } from "zod";
import { listOrders } from "@/server/orders";
import { forbidden, parseQuery, route } from "@/server/http";

export const dynamic = "force-dynamic";

const q = z.object({
  as: z.enum(["buyer", "seller"]).default("buyer"),
  status: z
    .enum(["PENDING_PAYMENT", "ESCROWED", "SHIPPED", "DELIVERED", "DISPUTED", "COMPLETED", "REFUNDED", "CANCELLED"])
    .optional(),
  cursor: z.string().max(64).optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
});

export const GET = route({ auth: "user" }, async ({ req, user }) => {
  const query = parseQuery(req, q);
  if (query.as === "seller" && !user!.sellerId) throw forbidden("Seller account required");
  return listOrders(user!, query.as, query);
});
