// Bundles the relayer worker into a single ESM file for `node dist/relayer.mjs` (Render background worker).
import { build } from "esbuild";

await build({
  entryPoints: ["src/workers/relayer.ts"],
  outfile: "dist/relayer.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  // Prisma loads its query engine at runtime — keep it external (installed via @trestle/db)
  external: ["@prisma/client", ".prisma/client", "bufferutil", "utf-8-validate"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
