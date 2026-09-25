import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma, type Role } from "@trestle/db";
import { env } from "./env";
import { kv } from "./kv";

export const SESSION_COOKIE = "trestle_session";

export interface SessionClaims {
  sid: string;
  uid: string;
  /** wallet address proven at sign-in ("" for email sign-in) */
  addr: string;
}

export interface AuthedUser {
  id: string;
  /** null for email-only accounts; crypto routes call requireWallet() */
  walletAddress: string | null;
  email: string | null;
  role: Role;
  displayName: string | null;
  sellerId: string | null;
  sessionId: string;
}

function key() {
  return new TextEncoder().encode(env().siweSecret);
}

export async function issueSession(
  uid: string,
  addr: string,
): Promise<{ token: string; maxAge: number; sid: string }> {
  const sid = randomBytes(16).toString("hex");
  const maxAge = env().SESSION_TTL_SECONDS;
  await kv().set(`sess:${sid}`, uid, { ex: maxAge });
  const token = await new SignJWT({ uid, addr })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sid)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .setIssuer("trestle")
    .sign(key());
  return { token, maxAge, sid };
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "trestle", algorithms: ["HS256"] });
    const sid = payload.sub;
    if (!sid || typeof payload.uid !== "string" || typeof payload.addr !== "string") return null;
    // server-side revocation: the session must still exist in the KV store
    const uid = await kv().get(`sess:${sid}`);
    if (uid !== payload.uid) return null;
    return { sid, uid, addr: payload.addr };
  } catch {
    return null;
  }
}

/** Resolves the session to a fresh user record — roles are always read from the database, never the token. */
export async function userFromToken(token: string | undefined | null): Promise<AuthedUser | null> {
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.uid },
    include: { seller: { select: { id: true } } },
  });
  if (!user) return null;
  // a wallet session is bound to the wallet it proved; if the account's wallet changed, re-authenticate
  if (claims.addr && user.walletAddress !== claims.addr) return null;
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    sellerId: user.seller?.id ?? null,
    sessionId: claims.sid,
  };
}

export async function revokeSession(sid: string) {
  await kv().del(`sess:${sid}`);
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
