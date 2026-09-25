import { authorizeCardPayment, cancelCardCheckout, cardPaymentView } from "@/server/card-checkout";
import { route } from "@/server/http";

/** Called from the Stripe cancel_url page. Expires the session and releases stock; never marks paid. */
export const POST = route<{ id: string }>(
  { rateLimit: { bucket: "card-cancel", limit: 20, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { viewer } = await authorizeCardPayment(params.id, user, req);
    if (viewer !== "owner" && viewer !== "guest" && viewer !== "admin")
      return cardPaymentView(params.id, viewer, user?.sellerId);
    const result = await cancelCardCheckout(params.id);
    return { ...(await cardPaymentView(params.id, viewer, user?.sellerId)), cancel: result };
  },
);
