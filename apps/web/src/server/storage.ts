import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Where uploaded product images go.
 *  - "supabase": Supabase Storage (free tier) public bucket, via its REST API with the service-role key
 *    (server-side only). Public URL: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<key>
 *  - "local": development only — files in apps/web/.uploads, served by /api/uploads/<key>
 *  - otherwise uploads are disabled and the admin says so (image URLs can still be pasted).
 */
export type StorageDriver = "supabase" | "local" | null;

export function storageDriver(): StorageDriver {
  const e = env();
  if (e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  if (e.NODE_ENV !== "production" || e.STORAGE_DRIVER === "local") return "local";
  return null;
}

const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const e = env();
  const driver = storageDriver();
  if (driver === "supabase") {
    const base = e.SUPABASE_URL!.replace(/\/$/, "");
    const bucket = e.SUPABASE_STORAGE_BUCKET;
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: e.SUPABASE_SERVICE_ROLE_KEY!,
        "content-type": contentType,
        "cache-control": "31536000",
        "x-upsert": "false",
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`storage upload failed (${res.status})`);
    return `${base}/storage/v1/object/public/${bucket}/${key}`;
  }
  if (driver === "local") {
    const file = path.join(LOCAL_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `/api/uploads/${key}`;
  }
  throw new Error("uploads are not configured");
}

export async function readLocalObject(key: string): Promise<Buffer | null> {
  if (storageDriver() !== "local") return null;
  const file = path.normalize(path.join(LOCAL_DIR, key));
  if (!file.startsWith(LOCAL_DIR + path.sep)) return null; // no path traversal
  return readFile(file).catch(() => null);
}
