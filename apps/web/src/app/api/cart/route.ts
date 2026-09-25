import { cartMutation } from "@/lib/schemas";
import {
  applyCartMutation,
  cartOwner,
  hydrateCart,
  readCart,
  setGuestCartCookie,
  writeCart,
} from "@/server/cart";
import { json, parseBody, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({}, async ({ req, user }) => {
  const { owner, newGuestId } = cartOwner(req, user);
  const cart = await hydrateCart(newGuestId ? [] : await readCart(owner));
  const res = json(cart);
  if (newGuestId) setGuestCartCookie(res, newGuestId);
  return res;
});

export const POST = route(
  { rateLimit: { bucket: "cart", limit: 120, windowSec: 60 } },
  async ({ req, user }) => {
    const mutation = await parseBody(req, cartMutation);
    const { owner, newGuestId } = cartOwner(req, user);
    const next = applyCartMutation(await readCart(owner), mutation);
    const hydrated = await hydrateCart(next);
    // persist only lines that still exist / are purchasable, at the quantity actually available
    await writeCart(
      owner,
      hydrated.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    );
    const res = json(hydrated);
    if (newGuestId) setGuestCartCookie(res, newGuestId);
    return res;
  },
);
