import { resetInput } from "@/lib/schemas";
import { ApiError, parseBody, route } from "@/server/http";
import { resetPassword } from "@/server/password-reset";

export const POST = route(
  { rateLimit: { bucket: "pw-reset-ip", limit: 10, windowSec: 900 } },
  async ({ req }) => {
    const { token, password } = await parseBody(req, resetInput);
    const r = await resetPassword(token, password);
    if (r !== "ok")
      throw new ApiError(400, "invalid_token", "This reset link is invalid or has expired. Request a new one.");
    return { ok: true };
  },
);
