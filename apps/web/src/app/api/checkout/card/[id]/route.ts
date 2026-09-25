import { authorizeCardPayment, cardPaymentView } from "@/server/card-checkout";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(
  { rateLimit: { bucket: "card-read", limit: 240, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { viewer } = await authorizeCardPayment(params.id, user, req);
    return cardPaymentView(params.id, viewer, user?.sellerId);
  },
);
