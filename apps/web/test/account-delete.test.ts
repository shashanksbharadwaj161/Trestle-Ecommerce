import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@trestle/db";
import { __setKV, MemoryKV } from "@/server/kv";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { DELETE as accountDELETE } from "@/app/api/account/route";
import { call, newJar, ORIGIN, req, resetDb, type Jar } from "./helpers";

const send = (method: string, path: string, body: unknown, jar: Jar) =>
  req(path, { method, body, jar, headers: { origin: ORIGIN } });

async function register(email: string) {
  const jar = newJar();
  const r = await call(
    registerPOST,
    send("POST", "/api/auth/register", { email, password: "delete me please 1", name: "D" }, jar),
    undefined,
    jar,
  );
  expect(r.status).toBe(201);
  return jar;
}

beforeEach(async () => {
  __setKV(new MemoryKV());
  await resetDb();
});

describe("self-service account deletion", () => {
  it("requires the password, then removes the account and ends the session", async () => {
    const jar = await register("delete@example.test");
    const wrong = await call(
      accountDELETE,
      send("DELETE", "/api/account", { password: "nope nope nope" }, jar),
      undefined,
      jar,
    );
    expect(wrong.status).toBe(403);
    expect(await prisma.user.count({ where: { email: "delete@example.test" } })).toBe(1);

    const ok = await call(
      accountDELETE,
      send("DELETE", "/api/account", { password: "delete me please 1" }, jar),
      undefined,
      jar,
    );
    expect(ok.status).toBe(200);
    expect(await prisma.user.count({ where: { email: "delete@example.test" } })).toBe(0);
    const s = await call(sessionGET, req("/api/auth/session", { jar }));
    expect(s.data.user).toBeNull();
  });

  it("refuses accounts with records that must be kept", async () => {
    const jar = await register("seller@example.test");
    await prisma.user.update({ where: { email: "seller@example.test" }, data: { role: "SELLER" } });
    const r = await call(
      accountDELETE,
      send("DELETE", "/api/account", { password: "delete me please 1" }, jar),
      undefined,
      jar,
    );
    expect(r.status).toBe(409);
    expect(await prisma.user.count({ where: { email: "seller@example.test" } })).toBe(1);
  });

  it("rejects cross-site requests and anonymous callers", async () => {
    const jar = await register("csrf@example.test");
    const cross = await call(
      accountDELETE,
      req("/api/account", {
        method: "DELETE",
        body: { password: "delete me please 1" },
        jar,
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(cross.status).toBe(403);
    const anon = await call(accountDELETE, send("DELETE", "/api/account", {}, newJar()));
    expect(anon.status).toBe(401);
  });
});
