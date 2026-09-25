import { NextResponse, type NextRequest } from "next/server";
import { readLocalObject } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

/** Development-only file server for locally stored uploads. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.join("/");
  const body = await readLocalObject(k);
  if (!body) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ext = k.split(".").pop() ?? "";
  return new NextResponse(new Uint8Array(body), {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
