import { SHIPPING_METHODS } from "@trestle/shared";
import { route } from "@/server/http";
import { cardConfig } from "@/server/stripe";
import { chainProfiles, deployment } from "@/server/chain";

export const dynamic = "force-dynamic";

/** Which payment rails are live. Each is independent: one being unconfigured never blocks the other. */
export const GET = route({}, async () => {
  const card = cardConfig();
  let cryptoChains: number[] = [];
  try {
    cryptoChains = chainProfiles()
      .filter((p) => !!deployment(p.chain.id))
      .map((p) => p.chain.id);
  } catch {
    cryptoChains = [];
  }
  return {
    card: { enabled: card.enabled, mode: card.mode, reason: card.reason ?? null },
    crypto: {
      enabled: cryptoChains.length > 0,
      chains: cryptoChains,
      reason: cryptoChains.length ? null : "Stablecoin checkout is not configured on this deployment.",
    },
    shippingMethods: Object.values(SHIPPING_METHODS),
  };
});
