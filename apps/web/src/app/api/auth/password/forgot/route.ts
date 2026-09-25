import { after } from "next/server";
import { forgotInput } from "@/lib/schemas";
import { ApiError, parseBody, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { emailProvider } from "@/server/email";
import { requestPasswordReset } from "@/server/password-reset";
import { env } from "@/server/env";

const GENERIC = "If an account exists for that email, we’ve sent a link to reset the password. It expires in 30 minutes.";

/**
 * Anti-enumeration: the response is identical whether or not the account exists, and the token + email work
 * happens after the response is sent (next/server `after`), so timing does not reveal it either.
 */
export const POST = route(
  { rateLimit: { bucket: "pw-forgot-ip", limit: 5, windowSec: 900 } },
  async ({ req }) => {
    const { email } = await parseBody(req, forgotInput);
    if (!emailProvider())
      throw new ApiError(503, "email_unavailable", "Password reset by email isn’t available on this store yet. Contact us and we’ll help.");
    const perEmail = await rateLimit("pw-forgot-email", email, 3, 3600);
    if (perEmail.ok) {
      const origin = env().APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
      const work = () =>
        requestPasswordReset(email, origin).catch((err) =>
          console.error("[password-reset] request failed", (err as Error).message),
        );
      try {
        after(work);
      } catch {
        // outside a Next request scope (unit tests): run inline, still not awaited
        void work();
      }
    }
    return { ok: true, message: GENERIC };
  },
);

export const GET = route({}, async () => ({ available: !!emailProvider() }));
