import "server-only";
import { kv } from "./kv";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/** Fixed-window limiter (INCR + EXPIRE) — works on Upstash REST and TCP Redis alike. */
export async function rateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${bucket}:${identity}:${window}`;
  const store = kv();
  const count = await store.incr(key);
  if (count === 1) await store.expire(key, windowSec + 1);
  const resetSeconds = (window + 1) * windowSec - Math.floor(Date.now() / 1000);
  return { ok: count <= limit, limit, remaining: Math.max(0, limit - count), resetSeconds };
}
