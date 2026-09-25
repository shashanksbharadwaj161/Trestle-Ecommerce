import { z } from "zod";
import {
  getChainProfiles,
  parseNetworkMode,
  priceTable,
  type ChainProfile,
  type PriceTable,
} from "@trestle/shared";

const hexKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex private key");

const schema = z.object({
  NETWORK_MODE: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CHAIN_A_RPC_URL: z.string().optional(),
  CHAIN_B_RPC_URL: z.string().optional(),
  SEPOLIA_RPC_URL: z.string().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  RELAYER_PRIVATE_KEY: hexKey.optional(),
  ATTESTER_PRIVATE_KEY: hexKey.optional(),
  RELAYER_SYNC_MODE: z.enum(["direct", "webhook"]).optional(),
  RELAYER_WEBHOOK_URL: z.string().url().optional(),
  RELAYER_WEBHOOK_SECRET: z.string().optional(),
  RELAYER_POLL_MS: z.coerce.number().int().min(250).max(120_000).optional(),
  RELAYER_MAX_BLOCK_RANGE: z.coerce.number().int().min(10).max(100_000).optional(),
  RELAYER_PRICE_TOLERANCE_BPS: z.coerce.number().int().min(0).max(1_000).default(50),
  RELAYER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  RELAYER_AUTO_RELEASE: z.enum(["true", "false"]).default("true"),
  PRICE_ETH_USD: z.string().optional(),
  RELAYER_ID: z.string().optional(),
});

export interface RelayerConfig {
  mode: "local" | "testnet";
  profiles: [ChainProfile, ChainProfile];
  relayerKey: `0x${string}`;
  attesterKey: `0x${string}`;
  syncMode: "direct" | "webhook";
  webhookUrl?: string;
  webhookSecret?: string;
  pollMs: number;
  maxBlockRange: bigint;
  priceToleranceBps: bigint;
  maxAttempts: number;
  autoRelease: boolean;
  prices: PriceTable;
  holderId: string;
}

/** Anvil account #1 — the relayer/attester in the local demo (public dev key, NETWORK_MODE=local only). */
const LOCAL_RELAYER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayerConfig {
  const e = schema.parse(env);
  const mode = parseNetworkMode(e.NETWORK_MODE);
  const relayerKey = (e.RELAYER_PRIVATE_KEY ??
    (mode === "local" ? LOCAL_RELAYER_KEY : undefined)) as `0x${string}` | undefined;
  if (!relayerKey) throw new Error("RELAYER_PRIVATE_KEY is required when NETWORK_MODE=testnet");
  const syncMode = e.RELAYER_SYNC_MODE ?? (e.RELAYER_WEBHOOK_URL ? "webhook" : "direct");
  if (
    syncMode === "webhook" &&
    (!e.RELAYER_WEBHOOK_URL || !e.RELAYER_WEBHOOK_SECRET || e.RELAYER_WEBHOOK_SECRET.length < 32)
  ) {
    throw new Error(
      "webhook sync mode needs RELAYER_WEBHOOK_URL and RELAYER_WEBHOOK_SECRET (>= 32 chars)",
    );
  }
  const profiles = getChainProfiles(mode, {
    chainARpcUrl: mode === "local" ? e.CHAIN_A_RPC_URL : e.SEPOLIA_RPC_URL,
    chainBRpcUrl: mode === "local" ? e.CHAIN_B_RPC_URL : e.BASE_SEPOLIA_RPC_URL,
  });
  return {
    mode,
    profiles,
    relayerKey,
    attesterKey: (e.ATTESTER_PRIVATE_KEY ?? relayerKey) as `0x${string}`,
    syncMode,
    webhookUrl: e.RELAYER_WEBHOOK_URL,
    webhookSecret: e.RELAYER_WEBHOOK_SECRET,
    pollMs: e.RELAYER_POLL_MS ?? (mode === "local" ? 1_500 : 6_000),
    maxBlockRange: BigInt(e.RELAYER_MAX_BLOCK_RANGE ?? (mode === "local" ? 5_000 : 1_000)),
    priceToleranceBps: BigInt(e.RELAYER_PRICE_TOLERANCE_BPS),
    maxAttempts: e.RELAYER_MAX_ATTEMPTS,
    autoRelease: e.RELAYER_AUTO_RELEASE === "true",
    prices: priceTable(e.PRICE_ETH_USD),
    holderId: e.RELAYER_ID ?? `relayer-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
