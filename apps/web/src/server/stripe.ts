import "server-only";
import Stripe from "stripe";
import { env } from "./env";

/**
 * Stripe is optional: without STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET card checkout is shown as
 * "not configured" and never pretends to take payment.
 */
export function cardConfig(): { enabled: boolean; mode: "test" | "mock" | null; reason?: string } {
  const e = env();
  const key = e.STRIPE_SECRET_KEY ?? "";
  if (!key) return { enabled: false, mode: null, reason: "Card payments are not configured yet." };
  if (/^(sk|rk)_live_/.test(key))
    // This build is limited to Stripe TEST MODE: live card processing has fees and is not enabled here.
    return {
      enabled: false,
      mode: null,
      reason: "Card payments run in Stripe test mode only on this store; a live key was supplied and is refused.",
    };
  if (!/^(sk|rk)_test_/.test(key))
    return { enabled: false, mode: null, reason: "Card payments are misconfigured." };
  if (!e.STRIPE_WEBHOOK_SECRET)
    return {
      enabled: false,
      mode: null,
      reason: "Card payments are not configured yet (missing webhook secret).",
    };
  const mock = !!mockBase();
  return { enabled: true, mode: mock ? "mock" : "test" };
}

/** Local mock host for contract tests — only with a TEST key and only on loopback, so it can never touch money. */
function mockBase(): URL | null {
  const e = env();
  if (!e.STRIPE_API_BASE) return null;
  const url = new URL(e.STRIPE_API_BASE);
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  if (!loopback || !e.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("STRIPE_API_BASE is only allowed with an sk_test_ key and a loopback host");
  }
  return url;
}

let client: Stripe | undefined;
let clientKey: string | undefined;

export function stripe(): Stripe {
  const e = env();
  const key = e.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  if (!/^(sk|rk)_test_/.test(key)) throw new Error("Only Stripe test-mode keys are accepted by this build");
  if (client && clientKey === key) return client;
  const base = mockBase();
  client = new Stripe(key, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Trestle" },
    ...(base
      ? {
          host: base.hostname,
          port: Number(base.port || (base.protocol === "https:" ? 443 : 80)),
          protocol: base.protocol.replace(":", "") as "http" | "https",
        }
      : {}),
  });
  clientKey = key;
  return client;
}

/** Verifies the Stripe-Signature header over the exact raw body. Throws on any mismatch. */
export function verifyWebhook(rawBody: string, signature: string | null): Stripe.Event {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Stripe webhook secret not configured");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe().webhooks.constructEvent(rawBody, signature, secret, 300);
}

export type { Stripe };
