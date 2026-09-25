import { issueNonce, NONCE_BIND_COOKIE, NONCE_TTL_SECONDS } from "@/server/siwe";
import { json, route } from "@/server/http";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export const GET = route({ rateLimit: { bucket: "siwe-nonce", limit: 30, windowSec: 60 } }, async () => {
  const { nonce, bind } = await issueNonce();
  const res = json({ nonce, expiresIn: NONCE_TTL_SECONDS });
  res.cookies.set(NONCE_BIND_COOKIE, bind, {
    httpOnly: true,
    sameSite: "strict",
    secure: env().NODE_ENV === "production",
    path: "/api/auth",
    maxAge: NONCE_TTL_SECONDS,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
});
