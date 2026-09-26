import { SHIPPING_METHODS } from "@trestle/shared";
import { route } from "@/server/http";
import { cardConfig } from "@/server/stripe";
import { cryptoChains as liveCryptoChains } from "@/server/payments";

export const dynamic = "force-dynamic";

/** Which payment rails are live. Each is independent: one being unconfigured never blocks the other. */
export const GET = route({}, async () => {
  const card = cardConfig();
  const cryptoChains = liveCryptoChains();
  return {
    // customer-facing reasons (setup details stay in server logs / docs)
    card: {
      enabled: card.enabled,
      mode: card.mode,
      reason: card.enabled ? null : "Card payments are temporarily unavailable.",
    },
    crypto: {
      enabled: cryptoChains.length > 0,
      chains: cryptoChains,
      reason: cryptoChains.length ? null : "Stablecoin payments are not available.",
    },
    shippingMethods: Object.values(SHIPPING_METHODS),
  };
});
