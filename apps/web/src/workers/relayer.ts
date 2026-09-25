/**
 * Trestle relayer worker — a long-lived process (Render Background Worker / `pnpm relayer`).
 *
 *  1. Indexes Trestle contract events on both chains with confirmation depth and durable checkpoints,
 *     delivering them to the app (HMAC webhook or direct DB apply).
 *  2. For every confirmed IntentCreated: validates it against the server-issued quote, checks solver liquidity
 *     on the destination, signs an EIP-712 attestation and calls fulfillIntent on the destination chain,
 *     then settleIntent on the source chain to repay the solver. Invalid/unfundable intents are refunded.
 *  3. Keeper duties: auto-release escrows past their delivery deadline; release expired stock reservations.
 *
 * TRUST: this demo relayer is also the (1-of-1) attester. See README → "Trust model".
 */
import { prisma } from "@trestle/db";
import { loadConfig } from "./relayer/config";
import { buildChains } from "./relayer/clients";
import { indexChain } from "./relayer/indexer";
import { IntentProcessor } from "./relayer/intents";
import { autoReleaseDue, sweepExpiredReservations } from "./relayer/keeper";
import { acquireLease, releaseLease } from "./relayer/lease";
import { log } from "./relayer/log";

const cfg = loadConfig();
const chains = buildChains(cfg);
const processor = new IntentProcessor(cfg, chains, prisma);
let stopping = false;
let leader = false;

async function tick() {
  const isLeader = await acquireLease(prisma, cfg.holderId, Math.max(30_000, cfg.pollMs * 10), {
    mode: cfg.mode,
    syncMode: cfg.syncMode,
    relayer: [...chains.values()][0]!.wallet.account.address,
    at: new Date().toISOString(),
  });
  if (isLeader !== leader)
    log.info(isLeader ? "acquired leader lease" : "standing by (another relayer holds the lease)");
  leader = isLeader;
  if (!isLeader) return;
  for (const ctx of chains.values()) {
    try {
      await indexChain(cfg, prisma, ctx);
    } catch (err) {
      log.error("indexing failed", { chainId: ctx.chainId, err: (err as Error).message });
    }
  }
  await processor.processPending();
  await autoReleaseDue(cfg, prisma, chains);
  await sweepExpiredReservations(prisma);
}

async function main() {
  log.info("relayer starting", {
    mode: cfg.mode,
    syncMode: cfg.syncMode,
    chains: [...chains.values()].map((c) => ({
      chainId: c.chainId,
      rpc: c.profile.rpcUrl.replace(/\/\/([^/]*@)?([^/]+).*/, "//$2/…"),
      router: c.dep.paymentRouter,
    })),
    pollMs: cfg.pollMs,
  });
  while (!stopping) {
    const started = Date.now();
    try {
      await tick();
    } catch (err) {
      log.error("tick failed", { err: (err as Error).message });
    }
    const wait = Math.max(0, cfg.pollMs - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  }
  await releaseLease(prisma, cfg.holderId).catch(() => undefined);
  await prisma.$disconnect();
  log.info("relayer stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log.info(`received ${sig}, finishing current tick`);
    stopping = true;
  });
}

main().catch((err) => {
  log.error("fatal", { err: (err as Error).message });
  process.exit(1);
});
