import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  // monorepo: trace workspace packages + Prisma engines from the repo root
  outputFileTracingRoot: path.join(here, "../../"),
  transpilePackages: ["@trestle/shared", "@trestle/db"],
  serverExternalPackages: ["@prisma/client", "ioredis"],
  typedRoutes: false,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90],
    deviceSizes: [390, 640, 768, 1080, 1280, 1600, 1920, 2400],
    imageSizes: [48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000,
    // uploaded product images (Supabase Storage public bucket)
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  eslint: { ignoreDuringBuilds: false },
  webpack: (cfg) => {
    // optional deps pulled in by wallet SDKs that are not needed in the browser bundle
    cfg.externals.push("pino-pretty", "lokijs", "encoding");
    // @base-org/account (pulled in by wagmi's connectors) imports @coinbase/cdp-sdk only for Base "charge" and
    // subscription helpers, which in turn import optional x402/Solana modules. Trestle never uses them, so the
    // package resolves to an empty module instead of breaking the bundle.
    // MetaMask SDK references a React-Native storage module that doesn't exist on the web.
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      "@coinbase/cdp-sdk": false,
      "@react-native-async-storage/async-storage": false,
    };
    return cfg;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
