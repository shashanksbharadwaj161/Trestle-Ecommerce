import { initiateInput } from "@/lib/schemas";
import { initiateCheckout } from "@/server/checkout";
import { parseBody, route } from "@/server/http";

export const POST = route(
  { auth: "user", rateLimit: { bucket: "checkout-initiate", limit: 10, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, initiateInput);
    return initiateCheckout(user!, input);
  },
);
