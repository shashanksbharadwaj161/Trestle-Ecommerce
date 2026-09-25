import "server-only";
import { prisma } from "@trestle/db";
import type { KV } from "./kv";

/** Atomic, durable storage for sessions, nonces and rate limits on the existing database. */
export class PostgresKV implements KV {
  readonly kind = "postgres" as const;
  async get(key: string) {
    const rows = await prisma.$queryRaw<
      { value: string }[]
    >`SELECT "value" FROM "AppKV" WHERE "key"=${key} AND ("expiresAt" IS NULL OR "expiresAt">NOW())`;
    return rows[0]?.value ?? null;
  }
  async set(key: string, value: string, opts: { ex?: number; nx?: boolean } = {}) {
    const expiry = opts.ex === undefined ? null : new Date(Date.now() + opts.ex * 1000);
    const rows = opts.nx
      ? await prisma.$queryRaw<
          { key: string }[]
        >`INSERT INTO "AppKV" ("key","value","expiresAt") VALUES (${key},${value},${expiry}) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value", "expiresAt"=EXCLUDED."expiresAt" WHERE "AppKV"."expiresAt"<=NOW() RETURNING "key"`
      : await prisma.$queryRaw<
          { key: string }[]
        >`INSERT INTO "AppKV" ("key","value","expiresAt") VALUES (${key},${value},${expiry}) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value", "expiresAt"=EXCLUDED."expiresAt" RETURNING "key"`;
    return rows.length > 0;
  }
  async getdel(key: string) {
    const rows = await prisma.$queryRaw<
      { value: string | null }[]
    >`DELETE FROM "AppKV" WHERE "key"=${key} RETURNING CASE WHEN "expiresAt" IS NULL OR "expiresAt">NOW() THEN "value" ELSE NULL END AS "value"`;
    return rows[0]?.value ?? null;
  }
  async del(key: string) {
    await prisma.$executeRaw`DELETE FROM "AppKV" WHERE "key"=${key}`;
  }
  async incr(key: string) {
    const rows = await prisma.$queryRaw<
      { value: string }[]
    >`INSERT INTO "AppKV" ("key","value") VALUES (${key},'1') ON CONFLICT ("key") DO UPDATE SET "value"=CASE WHEN "AppKV"."expiresAt"<=NOW() THEN '1' ELSE (("AppKV"."value")::bigint+1)::text END, "expiresAt"=CASE WHEN "AppKV"."expiresAt"<=NOW() THEN NULL ELSE "AppKV"."expiresAt" END RETURNING "value"`;
    return Number(rows[0]!.value);
  }
  async expire(key: string, seconds: number) {
    await prisma.$executeRaw`UPDATE "AppKV" SET "expiresAt"=NOW()+${seconds}*INTERVAL '1 second' WHERE "key"=${key} AND ("expiresAt" IS NULL OR "expiresAt">NOW())`;
  }
  async ttl(key: string) {
    const rows = await prisma.$queryRaw<
      { ttl: number }[]
    >`SELECT CASE WHEN "expiresAt" IS NULL THEN -1 WHEN "expiresAt"<=NOW() THEN -2 ELSE CEIL(EXTRACT(EPOCH FROM "expiresAt"-NOW()))::integer END AS ttl FROM "AppKV" WHERE "key"=${key}`;
    return rows[0]?.ttl ?? -2;
  }
}
