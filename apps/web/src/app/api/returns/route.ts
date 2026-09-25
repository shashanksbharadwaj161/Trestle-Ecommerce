import { returnInput } from "@/lib/schemas";
import { createReturn } from "@/server/returns";
import { parseBody, route } from "@/server/http";

/** Return request for a delivered card order — by the signed-in buyer or the holder of the private order link. */
export const POST = route(
  { rateLimit: { bucket: "returns", limit: 10, windowSec: 600 } },
  async ({ req, user }) => {
    const input = await parseBody(req, returnInput);
    return { returnRequest: await createReturn(input, user, req) };
  },
);
