import { prisma, hashPassword, verifyPassword, Prisma } from "@trestle/db";
import { credentialsInput } from "@/lib/schemas";
import { ApiError, conflict, parseBody, route } from "@/server/http";
import { publicUser } from "@/server/auth";

/**
 * Adds (wallet-only accounts) or changes email + password for the signed-in account.
 * Changing existing credentials requires the current password.
 */
export const POST = route(
  { auth: "user", rateLimit: { bucket: "credentials", limit: 5, windowSec: 600 } },
  async ({ req, user }) => {
    const input = await parseBody(req, credentialsInput);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user!.id } });
    if (row.passwordHash) {
      const ok = await verifyPassword(input.currentPassword ?? "", row.passwordHash);
      if (!ok)
        throw new ApiError(401, "invalid_credentials", "Your current password is incorrect.");
    }
    try {
      await prisma.user.update({
        where: { id: row.id },
        data: {
          email: input.email,
          passwordHash: await hashPassword(input.password),
          // a changed address is unverified until a verification flow confirms it
          emailVerifiedAt: input.email === row.email ? row.emailVerifiedAt : null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        throw conflict("That email is already used by another account.");
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        actorId: row.id,
        action: row.passwordHash ? "account.credentials_changed" : "account.credentials_added",
        entity: "User",
        entityId: row.id,
      },
    });
    return { user: await publicUser(row.id) };
  },
);
