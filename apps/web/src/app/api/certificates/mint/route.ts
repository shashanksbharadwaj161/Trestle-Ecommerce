import { z } from "zod";
import { encodeFunctionData, getAddress, keccak256, toBytes } from "viem";
import { prisma } from "@trestle/db";
import { trestleAuthenticityAbi } from "@trestle/shared/abis";
import { env } from "@/server/env";
import { publicClient, requireDeployment } from "@/server/chain";
import { conflict, forbidden, notFound, parseBody, route } from "@/server/http";

const body = z.object({
  productId: z.string().min(1).max(64),
  batch: z.string().trim().min(1).max(80),
  manufacturer: z.string().trim().max(80).optional(),
});

/** Returns the mintCertificateWithDetails call for the seller's wallet (requires on-chain SELLER_ROLE). */
export const POST = route({ auth: "seller", rateLimit: { bucket: "cert-mint", limit: 20, windowSec: 60 } }, async ({ req, user }) => {
  const input = await parseBody(req, body);
  const product = await prisma.product.findUnique({ where: { id: input.productId }, include: { seller: true } });
  if (!product) throw notFound("Product");
  if (product.sellerId !== user!.sellerId) throw forbidden("You can only certify your own products");
  const seller = product.seller;
  if (seller.payoutAddress !== user!.walletAddress) {
    throw conflict("Certificates are minted by your payout wallet — sign in with it to mint");
  }
  const chainId = seller.payoutChainId;
  const dep = requireDeployment(chainId);
  const hasRole = (await publicClient(chainId).readContract({
    address: dep.authenticity,
    abi: trestleAuthenticityAbi,
    functionName: "hasRole",
    args: [keccak256(toBytes("SELLER_ROLE")), getAddress(seller.payoutAddress)],
  })) as boolean;
  if (!hasRole) throw forbidden("Your wallet has not been granted SELLER_ROLE yet. Ask an admin to verify your storefront.");
  const base = env().APP_URL ?? new URL(req.url).origin;
  return {
    calls: [
      {
        chainId,
        to: dep.authenticity,
        data: encodeFunctionData({
          abi: trestleAuthenticityAbi,
          functionName: "mintCertificateWithDetails",
          args: [
            getAddress(seller.payoutAddress),
            product.id,
            input.manufacturer ?? product.manufacturer ?? "",
            input.batch,
            `${base}/api/certificates/metadata/${product.id}`,
          ],
        }),
        value: "0",
        description: `Mint authenticity certificate for “${product.title}”`,
      },
    ],
  };
});
