import { adminReturnAction } from "@/lib/schemas";
import { actOnReturn, suggestedRefundCents } from "@/server/returns";
import { parseBody, route } from "@/server/http";

export const GET = route<{ id: string }>({ auth: "admin" }, async ({ params }) => ({
  suggestedRefundCents: await suggestedRefundCents(params.id),
}));

export const POST = route<{ id: string }>(
  { auth: "admin", rateLimit: { bucket: "admin-return", limit: 30, windowSec: 60 } },
  async ({ req, params, user }) => {
    const input = await parseBody(req, adminReturnAction);
    return {
      returnRequest: await actOnReturn(params.id, input.action, user!, {
        adminNotes: input.adminNotes,
        refundCents: input.refundCents,
      }),
    };
  },
);
