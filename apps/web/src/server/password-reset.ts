import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma, hashPassword } from "@trestle/db";
import { sendMail } from "./email";

const TTL_MS = 30 * 60_000;
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

/** Creates a single-use token (only its hash is stored) and emails the link. No-op for unknown emails. */
export async function requestPasswordReset(email: string, origin: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return;
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // one live token per account: older unused tokens stop working
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS) },
    }),
  ]);
  const link = `${origin}/reset-password?token=${token}`;
  await sendMail({
    to: email,
    subject: "Reset your Trestle password",
    text: `Someone asked to reset the password for this Trestle account.\n\nReset it here (valid for 30 minutes, one use):\n${link}\n\nIf this wasn't you, ignore this email — your password stays the same.`,
  });
}

export type ResetResult = "ok" | "invalid";

/** Consumes a token atomically, sets the new password and invalidates every existing session. */
export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return "invalid";
  const hash = sha256(token);
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return "invalid" as const;
    const row = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hash } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: new Date() } });
    await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: row.userId, action: "account.password_reset", entity: "User", entityId: row.userId } });
    return "ok" as const;
  });
}
