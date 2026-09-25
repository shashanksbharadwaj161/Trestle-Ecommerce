import "server-only";
import { Redis as Upstash } from "@upstash/redis";
import IORedis from "ioredis";
import { PostgresKV } from "./postgres-kv";
import { env } from "./env";

/**
 * Minimal key-value interface used for SIWE nonces, sessions, carts, checkout quotes, rate limits and the
 * relayer leader lock. Backed by Upstash (REST — works from Vercel serverless and Render), a TCP Redis
 * (REDIS_URL — docker compose), or an in-process map when neither is configured (dev/test only).
 */
export interface KV {
  readonly kind: "upstash" | "redis" | "memory" | "postgres";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<boolean>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
}

class UpstashKV implements KV {
  readonly kind = "upstash" as const;
  constructor(private r: Upstash) {}
  get(key: string) {
    return this.r.get<string>(key);
  }
  async set(key: string, value: string, opts: { ex?: number; nx?: boolean } = {}) {
    const res = opts.ex
      ? opts.nx
        ? await this.r.set(key, value, { ex: opts.ex, nx: true })
        : await this.r.set(key, value, { ex: opts.ex })
      : opts.nx
        ? await this.r.set(key, value, { nx: true })
        : await this.r.set(key, value);
    return res === "OK";
  }
  getdel(key: string) {
    return this.r.getdel<string>(key);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  incr(key: string) {
    return this.r.incr(key);
  }
  async expire(key: string, seconds: number) {
    await this.r.expire(key, seconds);
  }
  ttl(key: string) {
    return this.r.ttl(key);
  }
}

class RedisKV implements KV {
  readonly kind = "redis" as const;
  constructor(private r: IORedis) {}
  get(key: string) {
    return this.r.get(key);
  }
  async set(key: string, value: string, opts: { ex?: number; nx?: boolean } = {}) {
    const args: (string | number)[] = [];
    if (opts.ex) args.push("EX", opts.ex);
    if (opts.nx) args.push("NX");
    const res = await (
      this.r.set as unknown as (...a: (string | number)[]) => Promise<string | null>
    )(key, value, ...args);
    return res === "OK";
  }
  async getdel(key: string) {
    const res = await this.r.multi().get(key).del(key).exec();
    return (res?.[0]?.[1] as string | null) ?? null;
  }
  async del(key: string) {
    await this.r.del(key);
  }
  incr(key: string) {
    return this.r.incr(key);
  }
  async expire(key: string, seconds: number) {
    await this.r.expire(key, seconds);
  }
  ttl(key: string) {
    return this.r.ttl(key);
  }
}

class MemoryKV implements KV {
  readonly kind = "memory" as const;
  private m = new Map<string, { v: string; exp?: number }>();
  private live(key: string) {
    const e = this.m.get(key);
    if (e && e.exp !== undefined && e.exp <= Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, opts: { ex?: number; nx?: boolean } = {}) {
    if (opts.nx && this.live(key)) return false;
    this.m.set(key, { v: value, exp: opts.ex ? Date.now() + opts.ex * 1000 : undefined });
    return true;
  }
  async getdel(key: string) {
    const v = this.live(key)?.v ?? null;
    this.m.delete(key);
    return v;
  }
  async del(key: string) {
    this.m.delete(key);
  }
  async incr(key: string) {
    const e = this.live(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.m.set(key, { v: String(n), exp: e?.exp });
    return n;
  }
  async expire(key: string, seconds: number) {
    const e = this.live(key);
    if (e) e.exp = Date.now() + seconds * 1000;
  }
  async ttl(key: string) {
    const e = this.live(key);
    if (!e) return -2;
    return e.exp === undefined ? -1 : Math.ceil((e.exp - Date.now()) / 1000);
  }
}

const g = globalThis as unknown as { __trestleKV?: KV };

export function kv(): KV {
  if (g.__trestleKV) return g.__trestleKV;
  const e = env();
  let store: KV;
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) {
    store = new UpstashKV(
      new Upstash({
        url: e.UPSTASH_REDIS_REST_URL,
        token: e.UPSTASH_REDIS_REST_TOKEN,
        automaticDeserialization: false,
      }),
    );
  } else if (e.REDIS_URL) {
    store = new RedisKV(new IORedis(e.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false }));
  } else if (e.NODE_ENV === "production" && process.env.DATABASE_URL) {
    store = new PostgresKV();
  } else {
    if (e.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
      throw new Error(
        "Configure UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (or REDIS_URL) in production",
      );
    }
    store = new MemoryKV();
  }
  g.__trestleKV = store;
  return store;
}

/** Test hook. */
export function __setKV(store: KV | undefined) {
  g.__trestleKV = store;
}
export { MemoryKV };
