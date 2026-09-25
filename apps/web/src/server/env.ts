import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { parseNetworkMode } from "@trestle/shared";

const hexKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex private key")
  .optional()
  .or(z.literal("").transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NETWORK_MODE: z.string().optional(),
  APP_URL: z.string().url().optional(),
  SIWE_SECRET: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 3600),
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CHAIN_A_RPC_URL: z.string().optional(),
  CHAIN_B_RPC_URL: z.string().optional(),
  SEPOLIA_RPC_URL: z.string().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  PUBLIC_CHAIN_A_RPC_URL: z.string().optional(),
  PUBLIC_CHAIN_B_RPC_URL: z.string().optional(),
  BUNDLER_PRIVATE_KEY: hexKey,
  PAYMASTER_PRIVATE_KEY: hexKey,
  RELAYER_WEBHOOK_SECRET: z.string().optional(),
  PRICE_ETH_USD: z.string().optional(),
  PROTOCOL_FEE_BPS: z.coerce.number().int().min(0).max(500).default(100),
  SOLVER_SPREAD_BPS: z.coerce.number().int().min(0).max(1_000).default(10),
  DELIVERY_WINDOW_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  QUOTE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  INTENT_TTL_SECONDS: z.coerce.number().int().min(600).max(86_400).default(3600),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
  // ---- card payments (Stripe Checkout, hosted). Card checkout is disabled until both are set.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** TEST ONLY: point the SDK at a local mock (accepted only with an sk_test_ key and a loopback host) */
  STRIPE_API_BASE: z.string().url().optional(),
  CARD_CHECKOUT_TTL_MINUTES: z.coerce.number().int().min(30).max(1440).default(30),
  SHIPPING_COUNTRIES: z.string().default("US,CA,GB,IE,AU,NZ,DE,FR,NL,SE,DK,NO,ES,IT"),
  /** bearer secret for /api/cron/* (Vercel Cron sends it as Authorization: Bearer) */
  CRON_SECRET: z.string().optional(),
  SUPPORT_EMAIL: z.string().email().optional(),
  // ---- product image uploads (Supabase Storage free tier). Service-role key is server-only.
  SUPABASE_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("product-images"),
  STORAGE_DRIVER: z.enum(["supabase", "local"]).optional(),
  // ---- transactional email (password reset). Free-compatible: Resend free tier or any SMTP account.
  EMAIL_PROVIDER: z.enum(["resend", "smtp", "log"]).optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  WALLETCONNECT_PROJECT_ID: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema> & {
  mode: ReturnType<typeof parseNetworkMode>;
  siweSecret: string;
};

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.parse({
    ...process.env,
    APP_URL:
      process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined),
  });
  const isProd = parsed.NODE_ENV === "production";
  let siweSecret = parsed.SIWE_SECRET ?? "";
  // Domain-separated signing key from an existing server-only integration secret.
  // Explicit SIWE_SECRET still takes priority; rotating the source invalidates sessions.
  const integrationSecret = process.env.SUPABASE_JWT_SECRET || parsed.SUPABASE_SERVICE_ROLE_KEY;
  if (!siweSecret && integrationSecret && integrationSecret.length >= 32) {
    siweSecret = createHmac("sha256", integrationSecret)
      .update("trestle/session-signing/v1")
      .digest("hex");
  }
  if (siweSecret.length < 32) {
    if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
      throw new Error("SIWE_SECRET must be set to at least 32 characters in production");
    }
    siweSecret = siweSecret || "trestle-dev-only-insecure-session-secret-000";
  }
  cached = { ...parsed, mode: parseNetworkMode(parsed.NETWORK_MODE), siweSecret };
  return cached;
}

/** Server-side RPC URLs (may contain provider API keys — never sent to the browser). */
export function serverRpc() {
  const e = env();
  return e.mode === "testnet"
    ? { chainARpcUrl: e.SEPOLIA_RPC_URL, chainBRpcUrl: e.BASE_SEPOLIA_RPC_URL }
    : { chainARpcUrl: e.CHAIN_A_RPC_URL, chainBRpcUrl: e.CHAIN_B_RPC_URL };
}

/** Browser-safe configuration handed to the client from the root layout. */
export function publicConfig() {
  const e = env();
  return {
    mode: e.mode,
    rpc: {
      chainARpcUrl:
        e.PUBLIC_CHAIN_A_RPC_URL || (e.mode === "local" ? e.CHAIN_A_RPC_URL : undefined),
      chainBRpcUrl:
        e.PUBLIC_CHAIN_B_RPC_URL || (e.mode === "local" ? e.CHAIN_B_RPC_URL : undefined),
    },
    walletConnectProjectId:
      e.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || e.WALLETCONNECT_PROJECT_ID || "",
    protocolFeeBps: e.PROTOCOL_FEE_BPS,
  };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
