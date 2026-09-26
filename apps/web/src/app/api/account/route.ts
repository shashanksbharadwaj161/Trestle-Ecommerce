import { z } from "zod";
import { DUMMY_PASSWORD_HASH, prisma, verifyPassword } from "@trestle/db";
import { kv } from "@/server/kv";
import { ApiError, json, parseBody, route } from "@/server/http";
import { revokeSession, SESSION_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

const deleteInput = z.object({ password: z.string().max(200).optional() });

/**
 * Self-service account deletion. Only for accounts with no trading history: orders, payments, returns, reviews,
 * disputes, seller profiles and on-chain records are kept for the other party and for accounting, so those
 * accounts are pointed to support instead. Password accounts must confirm with their password.
 */
export const DELETE = route(
  { auth: "user", rateLimit: { bucket: "account-delete", limit: 5, windowSec: 600 } },
  async ({ req, user }) => {
    const input = await parseBody(req, deleteInput);
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: user!.id },
      select: {
        passwordHash: true,
        role: true,
        _count: {
          select: {
            orders: true,
            cardPayments: true,
            returnRequests: true,
            reviews: true,
            disputesRaised: true,
            disputesResolved: true,
            reputationEvents: true,
            loyaltyTransactions: true,
          },
        },
        seller: { select: { id: true } },
      },
    });
    if (u.passwordHash) {
      const ok = await verifyPassword(input.password ?? "", u.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!ok) throw new ApiError(403, "wrong_password", "That password isn’t right.");
    }
    const history = Object.values(u._count).some((n) => n > 0) || !!u.seller || u.role !== "BUYER";
    if (history)
      throw new ApiError(
        409,
        "has_history",
        "This account has orders or other records we must keep, so it can’t be deleted here. Contact us and we’ll help.",
      );
    await prisma.$transaction([
      prisma.auditLog.updateMany({ where: { actorId: user!.id }, data: { actorId: null } }),
      prisma.user.delete({ where: { id: user!.id } }), // cascades wishlist, reset tokens, smart accounts
    ]);
    await Promise.all([revokeSession(user!.sessionId), kv().del(`cart:${user!.id}`)]);
    const res = json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  },
);
