import { chainProfile } from "@/server/chain";
import { computeActions, loadOrderFor, readEscrow, readIntentStatus } from "@/server/orders";
import { gaslessAvailable } from "@/server/aa";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ params, user }) => {
  const { order, viewer } = await loadOrderFor(params.id, user!);
  const [escrow, intents] = await Promise.all([
    readEscrow(order),
    Promise.all(order.paymentIntents.map(async (i) => ({ id: i.id, onchain: await readIntentStatus(i) }))),
  ]);
  const actions = computeActions(order, viewer, user!, escrow);
  const shipping = viewer === "buyer" || viewer === "seller" || viewer === "admin" ? order.shippingAddress : null;
  return {
    viewer,
    order: { ...order, shippingAddress: shipping },
    escrow,
    intentsOnchain: intents,
    actions,
    gasless: gaslessAvailable(),
    chains: {
      escrow: order.escrowChainId ? chainProfile(order.escrowChainId)?.label ?? null : null,
      payout: chainProfile(order.payoutChainId)?.label ?? null,
    },
  };
});
