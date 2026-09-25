import type { PrismaClient } from "@trestle/db";
import { fetchTrestleEvents } from "@trestle/db/sync";
import type { RelayerConfig } from "./config";
import type { ChainCtx } from "./clients";
import { deliverEvents } from "./deliver";
import { log } from "./log";

/**
 * Durable, confirmation-aware indexer. For each chain it reads [checkpoint+1, head - (confirmations-1)] in
 * bounded ranges, delivers decoded events, and only then persists the new checkpoint. A crash between the two
 * re-delivers the range, which is harmless because event application is idempotent.
 */
export async function indexChain(
  cfg: RelayerConfig,
  prisma: PrismaClient,
  ctx: ChainCtx,
  maxRanges = 20,
) {
  const id = String(ctx.chainId);
  const head = await ctx.client.getBlockNumber();
  const safeHead = head - BigInt(Math.max(0, ctx.profile.confirmations - 1));
  const cp = await prisma.relayerCheckpoint.findUnique({ where: { id } });
  let from = cp ? cp.lastBlock + 1n : BigInt(ctx.dep.deployBlock);
  let total = 0;
  for (let i = 0; i < maxRanges && from <= safeHead; i++) {
    const to = from + cfg.maxBlockRange - 1n < safeHead ? from + cfg.maxBlockRange - 1n : safeHead;
    const events = await fetchTrestleEvents(ctx.client, cfg.mode, ctx.chainId, from, to);
    const { applied } = await deliverEvents(cfg, prisma, events);
    await prisma.relayerCheckpoint.upsert({
      where: { id },
      create: { id, chainId: ctx.chainId, lastBlock: to },
      update: { lastBlock: to },
    });
    if (events.length)
      log.info("indexed", { chainId: ctx.chainId, from, to, events: events.length, applied });
    total += events.length;
    from = to + 1n;
  }
  return { head, safeHead, indexedTo: from - 1n, events: total };
}
