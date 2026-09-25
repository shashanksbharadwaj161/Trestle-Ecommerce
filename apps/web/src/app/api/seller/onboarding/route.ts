import { prisma } from "@trestle/db";
import { payoutTokens } from "@trestle/shared";
import { onboardingInput } from "@/lib/schemas";
import { env } from "@/server/env";
import { chainProfiles, deployment } from "@/server/chain";
import { badRequest, conflict, parseBody, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const seller = user!.sellerId ? await prisma.seller.findUnique({ where: { id: user!.sellerId } }) : null;
  const options = chainProfiles()
    .filter((p) => deployment(p.chain.id))
    .map((p) => ({
      chainId: p.chain.id,
      chainName: p.label,
      tokens: payoutTokens(env().mode, p.chain.id).map((t) => ({ address: t.address.toLowerCase(), symbol: t.symbol, decimals: t.decimals })),
    }));
  return { seller, options, wallet: user!.walletAddress };
});

export const POST = route({ auth: "user", rateLimit: { bucket: "onboarding", limit: 10, windowSec: 60 } }, async ({ req, user }) => {
  const input = await parseBody(req, onboardingInput);
  const valid = payoutTokens(env().mode, input.payoutChainId).some((t) => t.address.toLowerCase() === input.payoutToken);
  if (!valid) throw badRequest("Payout token must be a supported stablecoin on the selected chain");
  const slugOwner = await prisma.seller.findUnique({ where: { slug: input.slug } });
  if (slugOwner && slugOwner.userId !== user!.id) throw conflict("That storefront URL is taken");
  const payoutAddress = input.payoutAddress ?? user!.walletAddress;
  const existing = await prisma.seller.findUnique({ where: { userId: user!.id } });
  const payoutChanged = existing && (existing.payoutAddress !== payoutAddress || existing.payoutChainId !== input.payoutChainId);
  const seller = await prisma.$transaction(async (tx) => {
    const s = await tx.seller.upsert({
      where: { userId: user!.id },
      create: {
        userId: user!.id,
        storefrontName: input.storefrontName,
        slug: input.slug,
        bio: input.bio,
        payoutChainId: input.payoutChainId,
        payoutToken: input.payoutToken,
        payoutAddress,
      },
      update: {
        storefrontName: input.storefrontName,
        slug: input.slug,
        bio: input.bio,
        payoutChainId: input.payoutChainId,
        payoutToken: input.payoutToken,
        payoutAddress,
        // changing where money goes requires re-verification
        ...(payoutChanged ? { verified: false, verifiedAt: null } : {}),
      },
    });
    if (user!.role === "BUYER") await tx.user.update({ where: { id: user!.id }, data: { role: "SELLER" } });
    return s;
  });
  await prisma.auditLog.create({
    data: { actorId: user!.id, action: existing ? "seller.update" : "seller.onboard", entity: "Seller", entityId: seller.id, data: {} },
  });
  return { seller };
});
