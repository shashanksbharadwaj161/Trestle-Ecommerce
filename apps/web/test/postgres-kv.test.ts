import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@trestle/db";
import { PostgresKV } from "../src/server/postgres-kv";
const store = new PostgresKV();
beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM "AppKV"`;
});
describe("durable database KV", () => {
  it("supports expiring values and atomic consume-once nonces", async () => {
    expect(await store.get("missing")).toBeNull();
    expect(await store.ttl("missing")).toBe(-2);
    await store.set("nonce", "bound-browser", { ex: 60 });
    expect(await store.ttl("nonce")).toBeGreaterThan(0);
    const consumed = await Promise.all(Array.from({ length: 8 }, () => store.getdel("nonce")));
    expect(consumed.filter((v) => v === "bound-browser")).toHaveLength(1);
    await store.set("old", "x", { ex: -1 });
    expect(await store.get("old")).toBeNull();
    expect(await store.getdel("old")).toBeNull();
  });
  it("enforces a single lease owner and allows replacing expired leases", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, i) => store.set("lock", String(i), { nx: true, ex: 60 })),
    );
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    await store.expire("lock", -1);
    expect(await store.set("lock", "new", { nx: true, ex: 60 })).toBe(true);
    expect(await store.get("lock")).toBe("new");
  });
  it("increments atomically and resets expired counters", async () => {
    await Promise.all(Array.from({ length: 12 }, () => store.incr("rate")));
    expect(await store.get("rate")).toBe("12");
    expect(await store.ttl("rate")).toBe(-1);
    await store.expire("rate", -1);
    expect(await store.incr("rate")).toBe(1);
    await store.del("rate");
    expect(await store.get("rate")).toBeNull();
  });
  it("counts a rate-limit window in one atomic statement and restarts it after expiry", async () => {
    const counts = await Promise.all(
      Array.from({ length: 10 }, () => store.incrWithTtl("win", 60)),
    );
    expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await store.ttl("win")).toBeGreaterThan(50);
    await store.expire("win", -1);
    expect(await store.incrWithTtl("win", 60)).toBe(1);
    expect(await store.ttl("win")).toBeGreaterThan(50);
  });
});
