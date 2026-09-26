import "server-only";
import { chainProfiles, deployment } from "./chain";
import { cardConfig } from "./stripe";

/** Chains with deployed escrow contracts (stablecoin checkout is live only when at least one exists). */
export function cryptoChains(): number[] {
  try {
    return chainProfiles()
      .filter((p) => !!deployment(p.chain.id))
      .map((p) => p.chain.id);
  } catch {
    return [];
  }
}

/** Which payment methods actually work on this deployment — drives checkout and all marketing copy. */
export function paymentAvailability() {
  return { card: cardConfig().enabled, crypto: cryptoChains().length > 0 };
}
