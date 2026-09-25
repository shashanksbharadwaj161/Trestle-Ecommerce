import { encodeFunctionData, getAddress, keccak256, toBytes } from "viem";
import { prisma } from "@trestle/db";
import { trestleEscrowAbi } from "@trestle/shared/abis";
import { resolveInput } from "@/lib/schemas";
import { publicClient, requireDeployment } from "@/server/chain";
import { conflict, forbidden, notFound, parseBody, route, requireWallet } from "@/server/http";

/**
 * Admin resolution. Records the arbitration notes and returns the `resolveDispute` call for the admin's
 * ARBITER_ROLE wallet to sign; the order/escrow state changes only once the on-chain DisputeResolved event
 * is ingested (via /api/chain/sync or the relayer).
 */
export const POST = route<{ id: string }>(
  { auth: "admin", rateLimit: { bucket: "dispute-resolve", limit: 20, windowSec: 60 } },
  async ({ req, params, user }) => {
    const input = await parseBody(req, resolveInput);
    const dispute = await prisma.dispute.findUnique({
      where: { id: params.id },
      include: { order: true },
    });
    if (!dispute) throw notFound("Dispute");
    if (dispute.status !== "OPEN") throw conflict("Dispute is already resolved");
    if (
      !dispute.raiseTxHash ||
      !dispute.order.escrowChainId ||
      !dispute.order.escrowContractOrderId
    ) {
      throw conflict("The dispute has not been raised on-chain yet");
    }
    const chainId = dispute.order.escrowChainId;
    const dep = requireDeployment(chainId);
    const arbiterRole = keccak256(toBytes("ARBITER_ROLE"));
    const isArbiter = (await publicClient(chainId).readContract({
      address: dep.escrow,
      abi: trestleEscrowAbi,
      functionName: "hasRole",
      args: [arbiterRole, getAddress(requireWallet(user!))],
    })) as boolean;
    if (!isArbiter)
      throw forbidden("Your wallet does not hold ARBITER_ROLE on the escrow contract");

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { resolutionNotes: input.notes },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user!.id,
        action: "dispute.resolve.prepare",
        entity: "Dispute",
        entityId: dispute.id,
        data: { buyerShareBps: input.buyerShareBps },
      },
    });
    return {
      calls: [
        {
          chainId,
          to: dep.escrow,
          data: encodeFunctionData({
            abi: trestleEscrowAbi,
            functionName: "resolveDispute",
            args: [BigInt(dispute.order.escrowContractOrderId), BigInt(input.buyerShareBps)],
          }),
          value: "0",
          description: `Resolve dispute: ${input.buyerShareBps / 100}% to buyer`,
        },
      ],
    };
  },
);
