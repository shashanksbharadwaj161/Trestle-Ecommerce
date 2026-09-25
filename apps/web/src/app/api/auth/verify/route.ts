import { z } from "zod";
import { prisma } from "@trestle/db";
import { NONCE_BIND_COOKIE, verifySiwe } from "@/server/siwe";
import { issueSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { json, parseBody, route } from "@/server/http";
import { env } from "@/server/env";

const body = z.object({
  message: z.string().min(50).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const POST = route(
  { rateLimit: { bucket: "siwe-verify", limit: 10, windowSec: 60 } },
  async ({ req }) => {
    const { message, signature } = await parseBody(req, body);
    // Pin the SIWE domain to APP_URL when configured; otherwise fall back to the request host.
    const appUrl = env().APP_URL;
    const host = appUrl
      ? new URL(appUrl).host
      : (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "");
    const { address } = await verifySiwe({
      message,
      signature: signature as `0x${string}`,
      host,
      bind: req.cookies.get(NONCE_BIND_COOKIE)?.value,
    });
    const walletAddress = address.toLowerCase();
    const user = await prisma.user.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
      include: { seller: { select: { id: true } } },
    });
    const { token, maxAge } = await issueSession(user.id, walletAddress);
    const res = json({
      user: {
        id: user.id,
        walletAddress,
        role: user.role,
        displayName: user.displayName,
        sellerId: user.seller?.id ?? null,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    res.cookies.delete({ name: NONCE_BIND_COOKIE, path: "/api/auth" });
    return res;
  },
);
