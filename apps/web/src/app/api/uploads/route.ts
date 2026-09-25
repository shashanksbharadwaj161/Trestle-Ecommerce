import { randomBytes } from "node:crypto";
import { ApiError, badRequest, route } from "@/server/http";
import { imageMeta } from "@/server/image-meta";
import { putObject, storageDriver } from "@/server/storage";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;
const MIN_LONG_EDGE = 1000;

export const GET = route({ auth: "seller" }, async () => ({ driver: storageDriver() }));

/** Product image upload for sellers/admins. Validates real image bytes, not the file name or header. */
export const POST = route(
  { auth: "seller", rateLimit: { bucket: "uploads", limit: 60, windowSec: 600 } },
  async ({ req, user }) => {
    if (!storageDriver())
      throw new ApiError(503, "uploads_unavailable", "Image uploads are not configured. Paste an image URL instead.");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw badRequest("Attach an image file");
    if (file.size > MAX_BYTES) throw badRequest("Images must be 12 MB or smaller");
    const buf = Buffer.from(await file.arrayBuffer());
    const meta = imageMeta(buf);
    if (!meta) throw badRequest("Use a JPEG, PNG, WebP or AVIF image");
    const longEdge = Math.max(meta.width, meta.height);
    if (longEdge < MIN_LONG_EDGE)
      throw badRequest(`Image is ${meta.width}×${meta.height}px; use at least ${MIN_LONG_EDGE}px on the long edge (1600–2000px recommended for zoom).`);
    const key = `products/${user!.id.slice(-8)}/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${meta.ext}`;
    const url = await putObject(key, buf, meta.mime);
    return { url, width: meta.width, height: meta.height, bytes: buf.length, recommended: longEdge >= 1600 };
  },
);
