import { authorizeCardPayment, claimCardPayment } from "@/server/card-checkout";
import { forbidden, route } from "@/server/http";

/** Attach a guest order to the signed-in account. Requires the private access token (cookie). */
export const POST = route<{ id: string }>({ auth: "user" }, async ({ req, params, user }) => {
  const { payment, viewer } = await authorizeCardPayment(params.id, user, req);
  if (viewer === "owner") return { ok: true, already: true };
  if (viewer !== "guest") throw forbidden("Open this order from its private link first.");
  await claimCardPayment(payment, user!);
  return { ok: true, already: false };
});
