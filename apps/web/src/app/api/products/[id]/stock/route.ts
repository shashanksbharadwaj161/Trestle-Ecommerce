import { stockPatch } from "@/lib/schemas";
import { setStock } from "@/server/products";
import { parseBody, route } from "@/server/http";

export const PATCH = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 60, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { variants } = await parseBody(req, stockPatch);
    return { product: await setStock(params.id, variants, user!) };
  },
);
