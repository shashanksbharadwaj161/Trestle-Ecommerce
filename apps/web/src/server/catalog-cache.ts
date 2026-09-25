import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Shared cache for PUBLIC catalogue reads only (products, collections, provenance) — never sessions, bags,
 * wishlists, orders or anything personal. Each cached read is at most REVALIDATE_SECONDS old and is dropped
 * immediately after any catalogue or stock write (see invalidateCatalog / route()). Stock shown on a page may
 * therefore lag a concurrent purchase briefly; every bag add and checkout re-checks stock in the database.
 */
export const CATALOG_TAG = "catalog";
const REVALIDATE_SECONDS = 60;

// JSON cannot carry BigInt (money) or Date; tag them so cached values come back with the same types.
function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (raw instanceof Date) return { $date: raw.toISOString() };
  if (typeof value === "bigint") return { $bigint: value.toString() };
  return value;
}
function reviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && typeof o.$bigint === "string") return BigInt(o.$bigint);
    if (keys.length === 1 && typeof o.$date === "string") return new Date(o.$date);
  }
  return value;
}
export const encode = (v: unknown) => JSON.stringify(v, replacer);
export const decode = <T>(s: string) => JSON.parse(s, reviver) as T;

/** Wraps a public catalogue read in the Next data cache (keyed by name + arguments). */
export function cachedCatalog<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
) {
  const cached = unstable_cache(
    async (...args: A) => encode(await fn(...args)),
    [`catalog:${name}`],
    {
      tags: [CATALOG_TAG],
      revalidate: REVALIDATE_SECONDS,
    },
  );
  return async (...args: A): Promise<R> => {
    // outside the Next server (unit tests, scripts) there is no data cache — read through
    if (!process.env.NEXT_RUNTIME) return fn(...args);
    return decode<R>(await cached(...args));
  };
}

export function invalidateCatalog() {
  if (!process.env.NEXT_RUNTIME) return;
  try {
    revalidateTag(CATALOG_TAG);
  } catch {
    /* not in a request scope (e.g. a script) — entries still expire within REVALIDATE_SECONDS */
  }
}

/** API paths whose successful writes can change products, collections or stock. */
export function writeAffectsCatalog(pathname: string) {
  return /^\/api\/(products|admin|seller|uploads|collections|checkout|webhooks|orders|returns|cron|disputes|certificates)(\/|$)/.test(
    pathname,
  );
}
