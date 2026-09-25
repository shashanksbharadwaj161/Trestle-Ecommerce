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
  eslint: { ignoreDuringBuilds: false },
  webpack: (cfg) => {
    // optional deps pulled in by wallet SDKs that are not needed in the browser bundle
    cfg.externals.push("pino-pretty", "lokijs", "encoding");
    return cfg;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
