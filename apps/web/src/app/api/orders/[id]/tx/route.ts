import { z } from "zod";
import { encodeFunctionData, getAddress } from "viem";
import { trestleEscrowAbi, trestlePaymentRouterAbi } from "@trestle/shared/abis";
import { planFor, type TxCall } from "@/server/checkout";
import { computeActions, loadOrderFor, readEscrow } from "@/server/orders";
import { requireDeployment } from "@/server/chain";
import { badRequest, conflict, parseBody, route } from "@/server/http";

const body = z.object({
  action: z.enum(["pay", "confirmDelivery", "raiseDispute", "sellerRefund", "refundExpired"]),
  reason: z.string().trim().min(10).max(1000).optional(),
});

/** Returns server-built calldata for actions the user signs with their own wallet. */
export const POST = route<{ id: string }>(
  { auth: "user", rateLimit: { bucket: "order-tx", limit: 60, windowSec: 60 } },
  async ({ req, params, user }) => {
    const { action, reason } = await parseBody(req, body);
    const { order, viewer } = await loadOrderFor(params.id, user!);
    const escrow = await readEscrow(order);
    const actions = computeActions(order, viewer, user!, escrow);
    const escrowCall = (
      fn: "confirmDelivery" | "raiseDispute" | "refundBySeller",
      description: string,
    ): TxCall => {
      const dep = requireDeployment(order.escrowChainId!);
      const id = BigInt(order.escrowContractOrderId!);
      const data =
        fn === "raiseDispute"
          ? encodeFunctionData({ abi: trestleEscrowAbi, functionName: fn, args: [id, reason!] })
          : encodeFunctionData({ abi: trestleEscrowAbi, functionName: fn, args: [id] });
      return { chainId: order.escrowChainId!, to: dep.escrow, data, value: "0", description };
    };
    switch (action) {
      case "pay": {
        if (!actions.payNow) throw conflict("This order is not awaiting payment");
        return planFor(actions.payNow.paymentIntentId);
      }
      case "confirmDelivery":
        if (actions.confirmDelivery?.via !== "wallet")
          throw conflict("Use the gasless flow for this order");
        return { calls: [escrowCall("confirmDelivery", "Confirm delivery & release escrow")] };
      case "raiseDispute":
        if (actions.raiseDispute?.via !== "wallet")
          throw conflict("Use the gasless flow for this order");
        if (!reason) throw badRequest("A reason is required");
        return { calls: [escrowCall("raiseDispute", "Raise a dispute")] };
      case "sellerRefund":
        if (!actions.sellerRefund)
          throw conflict("This order cannot be refunded by the seller now");
        return {
          calls: [escrowCall("refundBySeller", "Refund the buyer in full")],
          signer: getAddress(order.seller.payoutAddress),
        };
      case "refundExpired": {
        if (!actions.refundExpiredIntent) throw conflict("No expired intent to refund");
        const dep = requireDeployment(actions.refundExpiredIntent.chainId);
        return {
          calls: [
            {
              chainId: actions.refundExpiredIntent.chainId,
              to: dep.paymentRouter,
              data: encodeFunctionData({
                abi: trestlePaymentRouterAbi,
                functionName: "refundExpired",
                args: [actions.refundExpiredIntent.intentId as `0x${string}`],
              }),
              value: "0",
              description: "Refund expired cross-chain payment",
            },
          ],
        };
      }
    }
  },
);
