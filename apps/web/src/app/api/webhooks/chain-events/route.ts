import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@trestle/db";
import { applyChainEvents, type NormalizedEvent } from "@trestle/db/sync";
import { env } from "@/server/env";
import { enrichCertificates } from "@/server/sync";
import { ApiError, errorResponse, json } from "@/server/http";
import { supportedChainIds } from "@/server/chain";

const MAX_SKEW_SECONDS = 300;

const eventSchema = z.object({
  chainId: z.number().int().positive(),
  contract: z.enum([
    "escrow",
    "paymentRouter",
    "reputation",
    "loyalty",
    "authenticity",
    "paymaster",
  ]),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  eventName: z.string().min(1).max(64),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  logIndex: z.number().int().min(0),
  blockNumber: z.string().regex(/^\d+$/),
  blockTime: z.string().datetime().nullable().optional(),
  args: z.record(z.unknown()),
});
const bodySchema = z.object({ events: z.array(eventSchema).max(500) });

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Internal endpoint the relayer worker posts decoded contract events to.
 * Auth: HMAC-SHA256 over `${timestamp}.${rawBody}` with RELAYER_WEBHOOK_SECRET; timestamps older than 5 minutes
 * are rejected (replay window) and each event is applied at most once (ChainEvent unique key).
 */
export async function POST(req: NextRequest) {
  try {
    const secret = env().RELAYER_WEBHOOK_SECRET;
    if (!secret || secret.length < 32)
      throw new ApiError(503, "webhook_disabled", "RELAYER_WEBHOOK_SECRET is not configured");
    const ts = req.headers.get("x-trestle-timestamp") ?? "";
    const sig = req.headers.get("x-trestle-signature") ?? "";
    const raw = await req.text();
    if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SECONDS) {
      throw new ApiError(401, "stale_webhook", "Missing or stale timestamp");
    }
    const expected = Buffer.from(signWebhook(secret, ts, raw), "hex");
    const given = Buffer.from(sig.replace(/^sha256=/, ""), "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ApiError(401, "bad_signature", "Invalid webhook signature");
    }
    const { events } = bodySchema.parse(JSON.parse(raw));
    const chains = supportedChainIds();
    if (events.some((e) => !chains.includes(e.chainId)))
      throw new ApiError(400, "unsupported_chain", "Unsupported chain in batch");
    const results = await applyChainEvents(prisma, events as NormalizedEvent[]);
    for (const chainId of new Set(events.map((e) => e.chainId))) {
      await enrichCertificates(
        chainId,
        events.filter((e) => e.chainId === chainId) as NormalizedEvent[],
      );
    }
    return json({
      received: events.length,
      applied: results.filter((r) => r.status === "applied").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      ignored: results.filter((r) => r.status === "ignored").length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
