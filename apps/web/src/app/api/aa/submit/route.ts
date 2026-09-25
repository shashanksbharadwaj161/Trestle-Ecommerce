import { z } from "zod";
import { submitUserOp } from "@/server/aa";
import { parseBody, route } from "@/server/http";

const body = z.object({
  chainId: z.coerce.number().int().positive(),
  userOpHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

export const POST = route(
  { auth: "user", rateLimit: { bucket: "aa-submit", limit: 20, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, body);
    return submitUserOp(user!, {
      chainId: input.chainId,
      userOpHash: input.userOpHash as `0x${string}`,
      signature: input.signature as `0x${string}`,
    });
  },
);
