import { cartMutation } from "@/lib/schemas";
import { applyCartMutation, hydrateCart, readCart, writeCart } from "@/server/cart";
import { parseBody, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const lines = await readCart(user!.id);
  return hydrateCart(lines);
});

export const POST = route(
  { auth: "user", rateLimit: { bucket: "cart", limit: 120, windowSec: 60 } },
  async ({ req, user }) => {
    const mutation = await parseBody(req, cartMutation);
    const next = applyCartMutation(await readCart(user!.id), mutation);
    const hydrated = await hydrateCart(next);
    // persist only lines that still exist / are purchasable
    await writeCart(
      user!.id,
      hydrated.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    );
    return hydrated;
  },
);
