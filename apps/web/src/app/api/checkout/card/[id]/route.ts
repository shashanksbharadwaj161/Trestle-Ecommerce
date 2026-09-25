import { authorizeCardPayment, cardPaymentView, GUEST_ORDER_COOKIE_PREFIX } from "@/server/card-checkout";
import { returnEligibility } from "@/server/returns";
import { route } from "@/server/http";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(
  { rateLimit: { bucket: "card-read", limit: 240, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { viewer } = await authorizeCardPayment(params.id, user, req);
    const view = await cardPaymentView(params.id, viewer, user?.sellerId);
    // the guest's own private link (built from the token they already hold in their cookie)
    let privateLink: string | null = null;
    if (viewer === "guest") {
      const token = req.cookies.get(`${GUEST_ORDER_COOKIE_PREFIX}${params.id}`)?.value;
      const origin = env().APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
      if (token) privateLink = `${origin}/api/checkout/card/${params.id}/access?t=${token}`;
    }
    return {
      ...view,
      privateLink,
      canClaim: viewer === "guest" && !!user && !view.payment.userId,
      eligibility: Object.fromEntries(view.payment.orders.map((o) => [o.id, returnEligibility(o)])),
    };
  },
);
