import { aaAction } from "@/lib/schemas";
import { prepareUserOp } from "@/server/aa";
import { parseBody, route } from "@/server/http";

export const POST = route(
  { auth: "user", rateLimit: { bucket: "aa-prepare", limit: 30, windowSec: 60 } },
  async ({ req, user }) => prepareUserOp(user!, await parseBody(req, aaAction)),
);
