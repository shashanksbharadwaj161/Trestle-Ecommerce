import { createHmac } from "node:crypto";
import type { PrismaClient } from "@trestle/db";
import { applyChainEvents, type NormalizedEvent } from "@trestle/db/sync";
import type { RelayerConfig } from "./config";

/**
 * Delivers decoded events to the app. `webhook` mode POSTs HMAC-signed batches to
 * /api/webhooks/chain-events (spec §7); `direct` mode applies them with the same shared function.
 * Either way application is idempotent, and callers only advance checkpoints after success.
 */
export async function deliverEvents(
  cfg: RelayerConfig,
  prisma: PrismaClient,
  events: NormalizedEvent[],
) {
  if (events.length === 0) return { applied: 0 };
  if (cfg.syncMode === "direct") {
    const res = await applyChainEvents(prisma, events);
    return { applied: res.filter((r) => r.status === "applied").length };
  }
  let applied = 0;
  for (let i = 0; i < events.length; i += 200) {
    const body = JSON.stringify({ events: events.slice(i, i + 200) });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", cfg.webhookSecret!).update(`${ts}.${body}`).digest("hex");
    const res = await fetch(cfg.webhookUrl!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trestle-timestamp": ts,
        "x-trestle-signature": sig,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok)
      throw new Error(`webhook delivery failed: ${res.status} ${await res.text().catch(() => "")}`);
    const data = (await res.json()) as { applied?: number };
    applied += data.applied ?? 0;
  }
  return { applied };
}
