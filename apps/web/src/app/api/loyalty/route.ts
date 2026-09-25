import { getAddress } from "viem";
import { prisma } from "@trestle/db";
import { trestleLoyaltyAbi } from "@trestle/shared/abis";
import { chainProfiles, deployment, publicClient } from "@/server/chain";
import { smartAccountFor } from "@/server/accounts";
import { gaslessAvailable } from "@/server/aa";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

/** TRST balances, stakes, pending rewards and fee discounts for the user's wallet and smart accounts, per chain. */
export const GET = route({ auth: "user" }, async ({ user }) => {
  const owner = getAddress(user!.walletAddress);
  const chains = [];
  for (const p of chainProfiles()) {
    const dep = deployment(p.chain.id);
    if (!dep) continue;
    const client = publicClient(p.chain.id);
    let smart: string | null = null;
    try {
      smart = await smartAccountFor(user!.id, owner, p.chain.id);
    } catch {
      smart = null;
    }
    const accounts = [];
    for (const [kind, addr] of [
      ["wallet", owner],
      ["smart", smart],
    ] as const) {
      if (!addr) continue;
      try {
        const a = getAddress(addr);
        const [balance, stake, pending, discount, weight] = await Promise.all([
          client.readContract({
            address: dep.loyalty,
            abi: trestleLoyaltyAbi,
            functionName: "balanceOf",
            args: [a],
          }),
          client.readContract({
            address: dep.loyalty,
            abi: trestleLoyaltyAbi,
            functionName: "stakeOf",
            args: [a],
          }),
          client.readContract({
            address: dep.loyalty,
            abi: trestleLoyaltyAbi,
            functionName: "pendingRewards",
            args: [a],
          }),
          client.readContract({
            address: dep.loyalty,
            abi: trestleLoyaltyAbi,
            functionName: "feeDiscountBps",
            args: [a],
          }),
          client.readContract({
            address: dep.loyalty,
            abi: trestleLoyaltyAbi,
            functionName: "votingWeight",
            args: [a],
          }),
        ]);
        const s = stake as { amount: bigint; stakedSince: bigint };
        accounts.push({
          kind,
          address: a.toLowerCase(),
          balance: (balance as bigint).toString(),
          staked: s.amount.toString(),
          stakedSince: Number(s.stakedSince),
          pendingRewards: (pending as bigint).toString(),
          feeDiscountBps: Number(discount as bigint),
          votingWeight: (weight as bigint).toString(),
        });
      } catch {
        /* rpc error — skip account */
      }
    }
    let tiers: { minStake: string; discountBps: number }[] = [];
    let aprBps = 0;
    try {
      const [t, apr] = await Promise.all([
        client.readContract({
          address: dep.loyalty,
          abi: trestleLoyaltyAbi,
          functionName: "tiers",
          args: [],
        }),
        client.readContract({
          address: dep.loyalty,
          abi: trestleLoyaltyAbi,
          functionName: "rewardAprBps",
          args: [],
        }),
      ]);
      tiers = (t as { minStake: bigint; discountBps: number }[]).map((x) => ({
        minStake: x.minStake.toString(),
        discountBps: Number(x.discountBps),
      }));
      aprBps = Number(apr as bigint);
    } catch {
      /* ignore */
    }
    chains.push({
      chainId: p.chain.id,
      chainName: p.label,
      loyalty: dep.loyalty,
      accounts,
      tiers,
      rewardAprBps: aprBps,
      online: accounts.length > 0,
    });
  }
  const history = await prisma.loyaltyTransaction.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { chains, history, gasless: gaslessAvailable() };
});
