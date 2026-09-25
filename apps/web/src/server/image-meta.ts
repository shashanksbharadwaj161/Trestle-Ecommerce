/** Reads format and pixel dimensions from image bytes (JPEG, PNG, WebP, AVIF) without decoding. */
export interface ImageMeta {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  ext: "jpg" | "png" | "webp" | "avif";
  width: number;
  height: number;
}

export function imageMeta(b: Buffer): ImageMeta | null {
  if (b.length < 32) return null;
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    return { mime: "image/png", ext: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: walk segments to a SOFn marker
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: "image/jpeg", ext: "jpg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP (RIFF....WEBP)
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X")
      return { mime: "image/webp", ext: "webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { mime: "image/webp", ext: "webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === "VP8 ")
      return { mime: "image/webp", ext: "webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  // AVIF (ISO BMFF with 'ftypavif' + ispe box)
  if (b.toString("ascii", 4, 8) === "ftyp" && /avi[fs]/.test(b.toString("ascii", 8, 12))) {
    const at = b.indexOf("ispe");
    if (at > 0) return { mime: "image/avif", ext: "avif", width: b.readUInt32BE(at + 8), height: b.readUInt32BE(at + 12) };
  }
  return null;
}
