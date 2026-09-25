import { cardCheckoutInput } from "@/lib/schemas";
import { cartOwner } from "@/server/cart";
import { createCardCheckout, setGuestOrderCookie } from "@/server/card-checkout";
import { json, parseBody, route } from "@/server/http";
import { env } from "@/server/env";

/** Starts a hosted Stripe Checkout Session. Works for guests (no account, no wallet). */
export const POST = route(
  { rateLimit: { bucket: "card-checkout", limit: 10, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, cardCheckoutInput);
    const { owner } = cartOwner(req, user);
    const origin = env().APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
    const r = await createCardCheckout({
      user,
      cartOwnerKey: owner,
      shippingMethod: input.shippingMethod,
      promoCode: input.promoCode,
      email: input.email,
      origin,
    });
    const res = json({ paymentId: r.paymentId, url: r.url, totals: r.totals });
    // the private access token lives only in an httpOnly cookie (and the private link on the confirmation page)
    setGuestOrderCookie(res, r.paymentId, r.guestToken);
    return res;
  },
);
