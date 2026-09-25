import { getAddress, isAddress } from "viem";
import { prisma } from "@trestle/db";
import { trestleReputationAbi } from "@trestle/shared/abis";
import { chainProfiles, deployment, publicClient } from "@/server/chain";
import { badRequest, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Public, portable reputation: live decayed scores read from the soulbound contract on every chain. */
export const GET = route<{ address: string }>(
  { rateLimit: { bucket: "reputation", limit: 120, windowSec: 60 } },
  async ({ params }) => {
    if (!isAddress(params.address)) throw badRequest("Invalid address");
    const address = params.address.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ walletAddress: address }, { smartAccounts: { some: { address } } }] },
      include: { smartAccounts: true },
    });
    const addresses = user ? [user.walletAddress, ...user.smartAccounts.map((s) => s.address)] : [address];

    const accounts = [];
    for (const a of [...new Set(addresses)]) {
      for (const p of chainProfiles()) {
        const dep = deployment(p.chain.id);
        if (!dep) continue;
        try {
          const [tokenId, score, lastUpdated, positive, negative] = (await publicClient(p.chain.id).readContract({
            address: dep.reputation,
            abi: trestleReputationAbi,
            functionName: "getReputation",
            args: [getAddress(a)],
          })) as [bigint, bigint, bigint, number, number];
          if (tokenId === 0n) continue;
          accounts.push({
            address: a,
            chainId: p.chain.id,
            chainName: p.label,
            tokenId: tokenId.toString(),
            scoreWad: score.toString(),
            lastUpdated: Number(lastUpdated),
            positiveEvents: positive,
            negativeEvents: negative,
            soulbound: true,
          });
        } catch {
          /* chain unreachable — omitted */
        }
      }
    }
    const events = await prisma.reputationEvent.findMany({
      where: { address: { in: addresses } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const breakdown: Record<string, { count: number; weight: number }> = {};
    for (const e of events) {
      const b = (breakdown[e.eventType] ??= { count: 0, weight: 0 });
      b.count += 1;
      b.weight += e.weight;
    }
    const totalWad = accounts.reduce((s, a) => s + BigInt(a.scoreWad), 0n);
    return {
      address,
      user: user ? { id: user.id, displayName: user.displayName, role: user.role } : null,
      scoreWad: totalWad.toString(),
      cachedScore: user?.reputationScoreCache ?? null,
      accounts,
      breakdown,
      events,
    };
  },
);
