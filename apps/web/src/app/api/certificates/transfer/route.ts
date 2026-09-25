import { z } from "zod";
import { encodeFunctionData, getAddress } from "viem";
import { prisma } from "@trestle/db";
import { trestleAuthenticityAbi } from "@trestle/shared/abis";
import { publicClient, requireDeployment } from "@/server/chain";
import { loadOrderFor } from "@/server/orders";
import { conflict, forbidden, parseBody, route, requireWallet } from "@/server/http";

const body = z.object({ orderId: z.string().min(1).max(64) });

/**
 * After an order completes, the seller hands the item's authenticity certificate to the buyer's escrow account,
 * appending a transfer to the on-chain provenance log. Returns the transferFrom call for the seller's wallet.
 */
export const POST = route(
  { auth: "seller", rateLimit: { bucket: "cert-transfer", limit: 20, windowSec: 60 } },
  async ({ req, user }) => {
    const { orderId } = await parseBody(req, body);
    const { order, viewer } = await loadOrderFor(orderId, user!);
    if (viewer !== "seller") throw forbidden("Only the seller can transfer certificates");
    if (order.status !== "COMPLETED")
      throw conflict("Certificates are transferred once the order is completed");
    if (!order.buyerAccount) throw conflict("Unknown buyer account");
    const seller = order.seller.payoutAddress;
    if (seller !== requireWallet(user!))
      throw conflict("Sign in with your payout wallet (it holds the certificates)");
    const chainId = order.seller.payoutChainId;
    const dep = requireDeployment(chainId);
    const productIds = order.items.map((i) => i.productId);
    const candidates = await prisma.authenticityCertificate.findMany({
      where: { productId: { in: productIds }, chainId, ownerAddress: seller },
      orderBy: { createdAt: "asc" },
    });
    for (const c of candidates) {
      const owner = (await publicClient(chainId).readContract({
        address: dep.authenticity,
        abi: trestleAuthenticityAbi,
        functionName: "ownerOf",
        args: [BigInt(c.tokenId)],
      })) as string;
      if (owner.toLowerCase() !== seller) continue;
      return {
        certificate: { tokenId: c.tokenId, productId: c.productId },
        calls: [
          {
            chainId,
            to: dep.authenticity,
            data: encodeFunctionData({
              abi: trestleAuthenticityAbi,
              functionName: "transferFrom",
              args: [getAddress(seller), getAddress(order.buyerAccount), BigInt(c.tokenId)],
            }),
            value: "0",
            description: `Transfer certificate #${c.tokenId} to the buyer`,
          },
        ],
      };
    }
    throw conflict("You hold no certificate for this product on its payout chain — mint one first");
  },
);
