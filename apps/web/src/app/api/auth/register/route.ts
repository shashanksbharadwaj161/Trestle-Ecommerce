import { prisma, hashPassword, Prisma } from "@trestle/db";
import { registerInput } from "@/lib/schemas";
import { conflict, json, parseBody, route } from "@/server/http";
import { publicUser, startSession } from "@/server/auth";

export const POST = route(
  { rateLimit: { bucket: "register", limit: 5, windowSec: 600 } },
  async ({ req, user: current }) => {
    const input = await parseBody(req, registerInput);
    if (current) throw conflict("You are already signed in. Sign out to create another account.");
    const taken = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (taken) throw conflict("An account with this email already exists. Sign in instead.");
    let userId: string;
    try {
      const u = await prisma.user.create({
        data: {
          email: input.email,
          displayName: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });
      userId = u.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        throw conflict("An account with this email already exists. Sign in instead.");
      throw err;
    }
    const res = json({ user: await publicUser(userId) }, { status: 201 });
    await startSession(req, res, userId, "");
    return res;
  },
);
