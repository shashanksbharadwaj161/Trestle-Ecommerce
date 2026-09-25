import { prisma, verifyPassword, DUMMY_PASSWORD_HASH } from "@trestle/db";
import { loginInput } from "@/lib/schemas";
import { ApiError, json, parseBody, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { publicUser, startSession } from "@/server/auth";

export const POST = route(
  { rateLimit: { bucket: "login-ip", limit: 20, windowSec: 600 } },
  async ({ req }) => {
    const input = await parseBody(req, loginInput);
    // per-account throttle on top of the per-IP one
    const rl = await rateLimit("login-email", input.email, 8, 600);
    if (!rl.ok)
      throw new ApiError(
        429,
        "rate_limited",
        `Too many sign-in attempts. Try again in ${rl.resetSeconds}s.`,
      );
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // always run scrypt so response time does not reveal whether the account exists
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !ok)
      throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
    const res = json({ user: await publicUser(user.id) });
    await startSession(req, res, user.id, "");
    return res;
  },
);
