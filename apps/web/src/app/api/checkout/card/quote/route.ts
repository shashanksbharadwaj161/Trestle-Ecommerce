import { cardTotalsInput } from "@/lib/schemas";
import { cartOwner } from "@/server/cart";
import { cardQuote } from "@/server/card-checkout";
import { parseBody, route } from "@/server/http";

export const POST = route(
  { rateLimit: { bucket: "card-quote", limit: 60, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, cardTotalsInput);
    const { owner } = cartOwner(req, user);
    const q = await cardQuote(owner, input);
    return {
      totals: q.totals,
      promo: q.promo ? { code: q.promo.code, description: q.promo.description } : null,
      promoNote: q.promoNote,
      warnings: q.cart.warnings,
      lineCount: q.cart.lines.length,
    };
  },
);
