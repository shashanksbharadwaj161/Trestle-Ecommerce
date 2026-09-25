import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { prisma, type Role } from "@trestle/db";
import {
  issueSession,
  revokeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from "./session";
import { mergeGuestCart } from "./cart";

export interface PublicUser {
  id: string;
  walletAddress: string | null;
  email: string | null;
  role: Role;
  displayName: string | null;
  sellerId: string | null;
  hasPassword: boolean;
}

export async function publicUser(userId: string): Promise<PublicUser> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { seller: { select: { id: true } } },
  });
  return {
    id: u.id,
    walletAddress: u.walletAddress,
    email: u.email,
    role: u.role,
    displayName: u.displayName,
    sellerId: u.seller?.id ?? null,
    hasPassword: !!u.passwordHash,
  };
}

/**
 * Issues a session cookie and runs post-sign-in work: the guest bag is merged into the account bag.
 * `wallet` is the address proven by SIWE for wallet sessions ("" for email sessions).
 */
export async function startSession(
  req: NextRequest,
  res: NextResponse,
  userId: string,
  wallet: string,
) {
  // rotate: the previous session (if any) is revoked server-side
  const previous = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (previous) await revokeSession(previous.sid);
  const { token, maxAge } = await issueSession(userId, wallet);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
  await mergeGuestCart(req, userId).catch((err) =>
    console.warn("[auth] guest bag merge failed", (err as Error).message),
  );
}
