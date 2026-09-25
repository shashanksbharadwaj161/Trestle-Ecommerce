import { z } from "zod";
import { encodeFunctionData, getAddress, keccak256, toBytes } from "viem";
import { prisma } from "@trestle/db";
import { trestleAuthenticityAbi } from "@trestle/shared/abis";
import { chainProfile, deployment, publicClient, requireDeployment } from "@/server/chain";
import { conflict, notFound, parseBody, route } from "@/server/http";

export const dynamic = "force-dynamic";
const SELLER_ROLE = keccak256(toBytes("SELLER_ROLE"));

async function hasSellerRole(chainId: number, address: string): Promise<boolean | null> {
  const dep = deployment(chainId);
  if (!dep) return null;
  try {
    return (await publicClient(chainId).readContract({
      address: dep.authenticity,
      abi: trestleAuthenticityAbi,
      functionName: "hasRole",
      args: [SELLER_ROLE, getAddress(address)],
    })) as boolean;
  } catch {
    return null;
  }
}

export const GET = route({ auth: "admin" }, async () => {
  const sellers = await prisma.seller.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { walletAddress: true, reputationScoreCache: true } },
      _count: { select: { products: true, orders: true } },
    },
  });
  return {
    sellers: await Promise.all(
      sellers.map(async (s) => ({
        ...s,
        payoutChainName: chainProfile(s.payoutChainId)?.label ?? String(s.payoutChainId),
        onchainSellerRole: await hasSellerRole(s.payoutChainId, s.payoutAddress),
      })),
    ),
  };
});

const body = z.object({
  sellerId: z.string().min(1),
  action: z.enum(["grant", "verify", "unverify"]),
});

/**
 * grant  → returns the grantRole(SELLER_ROLE) call for the admin wallet (authenticity DEFAULT_ADMIN_ROLE)
 * verify → marks the seller verified only once SELLER_ROLE is confirmed on-chain
 */
export const POST = route(
  { auth: "admin", rateLimit: { bucket: "admin-sellers", limit: 30, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, body);
    const seller = await prisma.seller.findUnique({ where: { id: input.sellerId } });
    if (!seller) throw notFound("Seller");
    if (input.action === "grant") {
      const dep = requireDeployment(seller.payoutChainId);
      return {
        calls: [
          {
            chainId: seller.payoutChainId,
            to: dep.authenticity,
            data: encodeFunctionData({
              abi: trestleAuthenticityAbi,
              functionName: "grantRole",
              args: [SELLER_ROLE, getAddress(seller.payoutAddress)],
            }),
            value: "0",
            description: `Grant SELLER_ROLE to ${seller.storefrontName}`,
          },
        ],
      };
    }
    if (input.action === "verify") {
      const role = await hasSellerRole(seller.payoutChainId, seller.payoutAddress);
      if (!role) throw conflict("SELLER_ROLE is not granted on-chain yet — grant it first");
    }
    const updated = await prisma.seller.update({
      where: { id: seller.id },
      data: {
        verified: input.action === "verify",
        verifiedAt: input.action === "verify" ? new Date() : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user!.id,
        action: `seller.${input.action}`,
        entity: "Seller",
        entityId: seller.id,
        data: {},
      },
    });
    return { seller: updated };
  },
);
