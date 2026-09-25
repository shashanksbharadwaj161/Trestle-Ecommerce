import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { imageMeta } from "@/server/image-meta";
import { __setKV, MemoryKV } from "@/server/kv";
import { POST as uploadPOST } from "@/app/api/uploads/route";
import { GET as uploadedGET } from "@/app/api/uploads/[...key]/route";
import { call, fixtureSeller, newJar, ORIGIN, resetDb } from "./helpers";

function png(w: number, h: number) {
  const b = Buffer.alloc(64);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function uploadReq(buf: Buffer, name: string, jar?: ReturnType<typeof newJar>) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(buf)], name));
  const headers: Record<string, string> = { origin: ORIGIN, host: "localhost:3000" };
  if (jar) headers.cookie = [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(`${ORIGIN}/api/uploads`, { method: "POST", body: fd, headers });
}

beforeEach(async () => {
  __setKV(new MemoryKV());
  await resetDb();
});

describe("product image uploads", () => {
  it("reads dimensions from real image headers", () => {
    expect(imageMeta(png(1600, 2000))).toMatchObject({ mime: "image/png", width: 1600, height: 2000 });
    expect(imageMeta(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>".padEnd(64)))).toBeNull();
  });

  it("requires a seller, validates bytes and resolution, and serves the stored file", async () => {
    expect((await call(uploadPOST, uploadReq(png(1600, 2000), "a.png"))).status).toBe(401);
    const f = await fixtureSeller();
    const { issueSession, SESSION_COOKIE } = await import("@/server/session");
    const s = await issueSession(f.user.id, f.user.walletAddress!);
    const jar = newJar();
    jar.cookies.set(SESSION_COOKIE, s.token);
    const fake = await call(uploadPOST, uploadReq(Buffer.from("not an image at all, just text".padEnd(64)), "evil.png", jar));
    expect(fake.status).toBe(400);
    const small = await call(uploadPOST, uploadReq(png(600, 800), "small.png", jar));
    expect(small.status).toBe(400);
    expect(small.data.error.message).toMatch(/1000px/);
    const ok = await call(uploadPOST, uploadReq(png(1600, 2000), "big.png", jar));
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ width: 1600, height: 2000, recommended: true });
    expect(ok.data.url).toMatch(/^\/api\/uploads\/products\/.+\.png$/);
    const key = ok.data.url.replace("/api/uploads/", "").split("/");
    const served = await uploadedGET(new NextRequest(`${ORIGIN}${ok.data.url}`), { params: Promise.resolve({ key }) });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const traversal = await uploadedGET(new NextRequest(`${ORIGIN}/api/uploads/x`), { params: Promise.resolve({ key: ["..", "..", "package.json"] }) });
    expect(traversal.status).toBe(404);
  });
});
