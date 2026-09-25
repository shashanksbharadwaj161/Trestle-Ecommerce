import { findToken } from "@trestle/shared";
import { chainProfile } from "@/server/chain";
import { env } from "@/server/env";
import { computeActions, loadOrderFor, readEscrow, readIntentStatus } from "@/server/orders";
import { gaslessAvailable } from "@/server/aa";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({ auth: "user" }, async ({ params, user }) => {
  const { order, viewer } = await loadOrderFor(params.id, user!);
  const [escrow, intents] = await Promise.all([
    readEscrow(order),
    Promise.all(
      order.paymentIntents.map(async (i) => ({ id: i.id, onchain: await readIntentStatus(i) })),
    ),
  ]);
  const actions = computeActions(order, viewer, user!, escrow);
  const shipping =
    viewer === "buyer" || viewer === "seller" || viewer === "admin" ? order.shippingAddress : null;
  const tokens: Record<string, { symbol: string; decimals: number }> = {};
  for (const i of order.paymentIntents) {
    for (const [chainId, addr] of [
      [i.sourceChainId, i.sourceToken],
      [i.destChainId, i.destToken],
    ] as const) {
      const t = findToken(env().mode, chainId, addr);
      if (t)
        tokens[`${chainId}:${addr.toLowerCase()}`] = { symbol: t.symbol, decimals: t.decimals };
    }
  }
  const payout =
    order.payoutChainId != null && order.payoutToken
      ? findToken(env().mode, order.payoutChainId, order.payoutToken)
      : undefined;
  if (payout && order.payoutToken)
    tokens[`${order.payoutChainId}:${order.payoutToken.toLowerCase()}`] = {
      symbol: payout.symbol,
      decimals: payout.decimals,
    };
  return {
    viewer,
    tokens,
    order: { ...order, shippingAddress: shipping },
    escrow,
    intentsOnchain: intents,
    actions,
    gasless: gaslessAvailable(),
    chains: {
      escrow: order.escrowChainId ? (chainProfile(order.escrowChainId)?.label ?? null) : null,
      payout: order.payoutChainId ? (chainProfile(order.payoutChainId)?.label ?? null) : null,
    },
  };
});
