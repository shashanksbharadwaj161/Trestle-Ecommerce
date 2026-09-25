import { z } from "zod";
import { prisma } from "@trestle/db";
import { NONCE_BIND_COOKIE, verifySiwe } from "@/server/siwe";
import { ApiError, json, parseBody, route } from "@/server/http";
import { env } from "@/server/env";
import { publicUser, startSession } from "@/server/auth";

const body = z.object({
  message: z.string().min(50).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/**
 * Sign-In with Ethereum.
 *  - Signed out: signs in to (or creates) the account that owns this wallet.
 *  - Signed in without a wallet (email account): LINKS the wallet to the current account. Both proofs are
 *    present — the session and the wallet signature — so no identity is ever joined on an email alone.
 *  - A wallet that already belongs to a different account is never moved.
 */
export const POST = route(
  { rateLimit: { bucket: "siwe-verify", limit: 10, windowSec: 60 } },
  async ({ req, user: current }) => {
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
    const owner = await prisma.user.findUnique({ where: { walletAddress } });

    let userId: string;
    let linked = false;
    if (current && current.walletAddress !== walletAddress) {
      if (current.walletAddress)
        throw new ApiError(
          409,
          "wallet_mismatch",
          "Your account is linked to a different wallet. Switch to that wallet, or sign out first.",
        );
      if (owner && owner.id !== current.id)
        throw new ApiError(
          409,
          "wallet_in_use",
          "This wallet already belongs to another Trestle account. Sign out and sign in with the wallet instead.",
        );
      await prisma.user.update({ where: { id: current.id }, data: { walletAddress } });
      await prisma.auditLog.create({
        data: {
          actorId: current.id,
          action: "account.wallet_linked",
          entity: "User",
          entityId: current.id,
          data: { walletAddress },
        },
      });
      userId = current.id;
      linked = true;
    } else {
      userId = (
        owner ??
        (await prisma.user.create({
          data: { walletAddress },
        }))
      ).id;
    }
    const res = json({ user: await publicUser(userId), linked });
    await startSession(req, res, userId, walletAddress);
    res.cookies.delete({ name: NONCE_BIND_COOKIE, path: "/api/auth" });
    return res;
  },
);
