import { quoteInput } from "@/lib/schemas";
import { createQuote } from "@/server/checkout";
import { parseBody, route } from "@/server/http";

export const POST = route(
  { auth: "user", rateLimit: { bucket: "checkout-quote", limit: 30, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, quoteInput);
    return createQuote(user!, input);
  },
);
