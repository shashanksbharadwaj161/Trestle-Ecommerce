import { z } from "zod";
import { encodeFunctionData } from "viem";
import { prisma } from "@trestle/db";
import { trestleEscrowAbi } from "@trestle/shared/abis";
import { disputeInput } from "@/lib/schemas";
import { computeActions, loadOrderFor, readEscrow } from "@/server/orders";
import { requireDeployment } from "@/server/chain";
import { conflict, forbidden, parseBody, parseQuery, route, requireWallet } from "@/server/http";

export const dynamic = "force-dynamic";

const listQuery = z.object({
  status: z.enum(["OPEN", "RESOLVED", "WITHDRAWN", "ALL"]).default("OPEN"),
});

/** Admin arbitration queue. */
export const GET = route({ auth: "admin" }, async ({ req }) => {
  const { status } = parseQuery(req, listQuery);
  const disputes = await prisma.dispute.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      raisedBy: { select: { displayName: true, walletAddress: true } },
      resolvedBy: { select: { displayName: true, walletAddress: true } },
      order: {
        include: {
          items: true,
          buyer: { select: { displayName: true, walletAddress: true, reputationScoreCache: true } },
          seller: {
            select: {
              storefrontName: true,
              payoutAddress: true,
              verified: true,
              user: { select: { reputationScoreCache: true } },
            },
          },
          paymentIntents: {
            select: { routeKind: true, sourceChainId: true, destChainId: true, status: true },
          },
        },
      },
    },
  });
  return { disputes };
});

/** File a dispute. Creates the off-chain case file and returns how to raise it on-chain (gasless or wallet). */
export const POST = route(
  { auth: "user", rateLimit: { bucket: "dispute", limit: 10, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, disputeInput);
    const { order, viewer } = await loadOrderFor(input.orderId, user!);
    if (viewer === "admin")
      throw forbidden("Admins resolve disputes; only the buyer or seller can file one");
    if (order.isSeedDemo) throw conflict("Seeded demo orders have no on-chain escrow");
    const escrow = await readEscrow(order);
    if (!escrow || escrow.status !== "Created")
      throw conflict("Only funded, open escrows can be disputed");
    if (Date.now() / 1000 > escrow.deliveryDeadline)
      throw conflict("The delivery deadline has passed; funds can now be auto-released");
    if (order.dispute?.raiseTxHash) throw conflict("A dispute is already open for this order");

    const raisedByAddress =
      viewer === "buyer" ? (order.buyerAccount ?? requireWallet(user!)) : order.seller.payoutAddress;
    const dispute = await prisma.dispute.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        raisedById: user!.id,
        raisedByAddress,
        reason: input.reason,
        evidence: input.evidence,
      },
      update: {
        reason: input.reason,
        evidence: input.evidence,
        raisedById: user!.id,
        raisedByAddress,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user!.id,
        action: "dispute.file",
        entity: "Dispute",
        entityId: dispute.id,
        data: { orderId: order.id },
      },
    });

    const actions = computeActions(order, viewer, user!, escrow);
    if (viewer === "buyer" && actions.raiseDispute?.via === "smart") {
      return {
        dispute,
        via: "smart",
        aaAction: { action: "raiseDispute", orderId: order.id, reason: input.reason },
      };
    }
    const dep = requireDeployment(order.escrowChainId!);
    return {
      dispute,
      via: "wallet",
      calls: [
        {
          chainId: order.escrowChainId!,
          to: dep.escrow,
          data: encodeFunctionData({
            abi: trestleEscrowAbi,
            functionName: "raiseDispute",
            args: [BigInt(order.escrowContractOrderId!), input.reason],
          }),
          value: "0",
          description: "Raise a dispute (freezes escrow)",
        },
      ],
    };
  },
);
