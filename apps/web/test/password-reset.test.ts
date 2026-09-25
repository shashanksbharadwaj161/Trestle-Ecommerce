import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@trestle/db";
import { __setKV, MemoryKV } from "@/server/kv";
import { __devOutbox } from "@/server/email";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { POST as forgotPOST } from "@/app/api/auth/password/forgot/route";
import { POST as resetPOST } from "@/app/api/auth/password/reset/route";
import { call, newJar, ORIGIN, req, resetDb, type Jar } from "./helpers";

const post = (path: string, body: unknown, jar?: Jar) => req(path, { method: "POST", body, jar, headers: { origin: ORIGIN } });
const settle = () => new Promise((r) => setTimeout(r, 400));

beforeEach(async () => {
  __setKV(new MemoryKV());
  await resetDb();
  __devOutbox.length = 0; // EMAIL_PROVIDER=log (test/setup-env.ts): nothing is sent; messages are kept in memory
});

describe("password reset (dev log email driver — no real email is sent)", () => {
  it("answers identically for unknown accounts and sends nothing for them", async () => {
    const r = await call(forgotPOST, post("/api/auth/password/forgot", { email: "nobody@example.test" }));
    expect(r.status).toBe(200);
    await settle();
    expect(__devOutbox).toHaveLength(0);
    const jar = newJar();
    await call(registerPOST, post("/api/auth/register", { email: "reset@example.test", password: "original password 1", name: "R" }, jar), undefined, jar);
    const r2 = await call(forgotPOST, post("/api/auth/password/forgot", { email: "reset@example.test" }));
    expect(r2.data).toEqual(r.data);
  });

  it("resets with a single-use, hashed, expiring token and signs out old sessions", async () => {
    const jar = newJar();
    await call(registerPOST, post("/api/auth/register", { email: "reset@example.test", password: "original password 1", name: "R" }, jar), undefined, jar);
    await new Promise((r) => setTimeout(r, 1100)); // session iat must predate the change (1s JWT granularity)
    await call(forgotPOST, post("/api/auth/password/forgot", { email: "reset@example.test" }));
    await settle();
    expect(__devOutbox).toHaveLength(1);
    const token = __devOutbox[0]!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toContain(token);

    const weak = await call(resetPOST, post("/api/auth/password/reset", { token, password: "short" }));
    expect(weak.status).toBe(400);
    const ok = await call(resetPOST, post("/api/auth/password/reset", { token, password: "brand new password 2" }));
    expect(ok.status).toBe(200);
    const replay = await call(resetPOST, post("/api/auth/password/reset", { token, password: "another password 3" }));
    expect(replay.status).toBe(400);

    const oldSession = await call(sessionGET, req("/api/auth/session", { jar }));
    expect(oldSession.data.user).toBeNull();
    expect((await call(loginPOST, post("/api/auth/login", { email: "reset@example.test", password: "original password 1" }))).status).toBe(401);
    expect((await call(loginPOST, post("/api/auth/login", { email: "reset@example.test", password: "brand new password 2" }))).status).toBe(200);
  });

  it("rejects expired tokens and a newer request invalidates older links", async () => {
    await call(registerPOST, post("/api/auth/register", { email: "reset@example.test", password: "original password 1", name: "R" }));
    await call(forgotPOST, post("/api/auth/password/forgot", { email: "reset@example.test" }));
    await settle();
    await call(forgotPOST, post("/api/auth/password/forgot", { email: "reset@example.test" }));
    await settle();
    const [first, second] = __devOutbox.map((m) => m.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!);
    expect((await call(resetPOST, post("/api/auth/password/reset", { token: first, password: "brand new password 2" }))).status).toBe(400);
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(resetPOST, post("/api/auth/password/reset", { token: second, password: "brand new password 2" }))).status).toBe(400);
  });

});
