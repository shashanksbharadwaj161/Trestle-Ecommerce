import "server-only";
import { erc20Abi, type Address } from "viem";
import { prisma } from "@trestle/db";
import { findToken, pow10, USD_MICROS } from "@trestle/shared";
import { entryPointAbi, trestlePaymentRouterAbi } from "@trestle/shared/abis";
import { env } from "./env";
import { chainProfiles, deployment, publicClient } from "./chain";
import { unstable_cache } from "next/cache";
import { decode, encode } from "./catalog-cache";

/** Rejects after `ms` so one slow RPC endpoint cannot hold the whole request open. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);
}

function toUsdMicros(amount: bigint, chainId: number, token: string): bigint {
  const t = findToken(env().mode, chainId, token);
  if (!t || !t.isStable) return 0n;
  return (amount * USD_MICROS) / pow10(t.decimals);
}

/** Headline numbers for the home page trust strip. */
export async function trustSignals() {
  const [liveEscrows, completed, events] = await Promise.all([
    prisma.order.count({
      where: {
        isSeedDemo: false,
        escrowContractOrderId: { not: null },
        status: { in: ["ESCROWED", "SHIPPED", "DELIVERED", "DISPUTED"] },
      },
    }),
    prisma.order.findMany({
      where: { isSeedDemo: false, status: "COMPLETED", paymentMethod: "CRYPTO" },
      select: {
        payoutAmount: true,
        payoutChainId: true,
        payoutToken: true,
        dispute: { select: { buyerShareBps: true } },
      },
    }),
    prisma.chainEvent.count(),
  ]);
  let settled = 0n;
  for (const o of completed) {
    if (o.payoutAmount == null || o.payoutChainId == null || !o.payoutToken) continue;
    const amount = BigInt(o.payoutAmount.toFixed());
    const sellerShare =
      o.dispute?.buyerShareBps != null
        ? (amount * BigInt(10_000 - o.dispute.buyerShareBps)) / 10_000n
        : amount;
    settled += toUsdMicros(sellerShare, o.payoutChainId, o.payoutToken);
  }
  return {
    liveEscrows,
    volumeSettledUsdMicros: settled,
    completedOrders: completed.length,
    chainEvents: events,
  };
}

async function chainHealth() {
  return Promise.all(
    chainProfiles().map(async (p) => {
      const dep = deployment(p.chain.id);
      const base = {
        chainId: p.chain.id,
        name: p.label,
        role: p.role,
        explorerUrl: p.explorerUrl ?? null,
        deployed: !!dep,
      };
      if (!dep)
        return {
          ...base,
          online: false,
          blockNumber: null,
          liquidity: [],
          paymasterDeposit: null,
          contracts: null,
        };
      const client = publicClient(p.chain.id);
      const d = dep;
      try {
        return await within(readChain(), 5_000);
      } catch {
        return {
          ...base,
          online: false,
          blockNumber: null,
          liquidity: [],
          paymasterDeposit: null,
          contracts: null,
        };
      }
      async function readChain() {
        const [blockNumber, usdcLiq, daiLiq, pmDeposit, checkpoint] = await Promise.all([
          client.getBlockNumber(),
          client.readContract({
            address: d.paymentRouter,
            abi: trestlePaymentRouterAbi,
            functionName: "totalLiquidity",
            args: [d.usdc],
          }),
          client.readContract({
            address: d.paymentRouter,
            abi: trestlePaymentRouterAbi,
            functionName: "totalLiquidity",
            args: [d.dai],
          }),
          client.readContract({
            address: d.entryPoint,
            abi: entryPointAbi,
            functionName: "balanceOf",
            args: [d.paymaster],
          }),
          prisma.relayerCheckpoint.findUnique({ where: { id: String(p.chain.id) } }),
        ]);
        const escrowUsdc = await client.readContract({
          address: d.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [d.escrow as Address],
        });
        const escrowDai = await client.readContract({
          address: d.dai,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [d.escrow as Address],
        });
        return {
          ...base,
          online: true,
          blockNumber: blockNumber.toString(),
          indexedBlock: checkpoint?.lastBlock.toString() ?? null,
          liquidity: [
            { symbol: "tUSDC", amount: (usdcLiq as bigint).toString(), decimals: 6 },
            { symbol: "tDAI", amount: (daiLiq as bigint).toString(), decimals: 18 },
          ],
          escrowBalances: [
            { symbol: "tUSDC", amount: (escrowUsdc as bigint).toString(), decimals: 6 },
            { symbol: "tDAI", amount: (escrowDai as bigint).toString(), decimals: 18 },
          ],
          paymasterDeposit: (pmDeposit as bigint).toString(),
          contracts: {
            escrow: d.escrow,
            paymentRouter: d.paymentRouter,
            relayerAdapter: d.relayerAdapter,
            paymaster: d.paymaster,
            reputation: d.reputation,
            loyalty: d.loyalty,
            authenticity: d.authenticity,
          },
        };
      }
    }),
  );
}

export async function protocolStats() {
  const [
    signals,
    intentGroups,
    disputes,
    recentIntents,
    recentEvents,
    seedDemoOrders,
    orderGroups,
    gasEvents,
    createdEvents,
    fulfilledEvents,
    chains,
  ] = await Promise.all([
    trustSignals(),
    prisma.paymentIntent.groupBy({
      by: ["status", "routeKind"],
      _count: { _all: true },
      where: { order: { isSeedDemo: false } },
    }),
    prisma.dispute.findMany({
      where: { order: { isSeedDemo: false } },
      select: { status: true, buyerShareBps: true },
    }),
    prisma.paymentIntent.findMany({
      where: {
        order: { isSeedDemo: false },
        OR: [{ sourceTxHash: { not: null } }, { status: { not: "CREATED" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            escrowContractOrderId: true,
            escrowChainId: true,
            subtotalUsdMicros: true,
          },
        },
      },
    }),
    prisma.chainEvent.findMany({
      orderBy: [{ blockTime: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.order.count({ where: { isSeedDemo: true } }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true }, where: { isSeedDemo: false } }),
    prisma.chainEvent.findMany({
      where: { eventName: "GasSponsored" },
      select: { args: true, chainId: true },
    }),
    prisma.chainEvent.findMany({
      where: { eventName: "IntentCreated" },
      select: { args: true, blockTime: true },
    }),
    prisma.chainEvent.findMany({
      where: { eventName: "IntentFulfilled" },
      select: { args: true, blockTime: true },
    }),
    chainHealth(),
  ]);

  const createdAt = new Map(
    createdEvents.map((e) => [
      String((e.args as Record<string, unknown>).intentId).toLowerCase(),
      e.blockTime,
    ]),
  );
  const durations: number[] = [];
  for (const f of fulfilledEvents) {
    const c = createdAt.get(String((f.args as Record<string, unknown>).intentId).toLowerCase());
    if (c && f.blockTime) durations.push((f.blockTime.getTime() - c.getTime()) / 1000);
  }
  durations.sort((a, b) => a - b);
  const gasSponsoredWei = gasEvents.reduce(
    (s, e) => s + BigInt(String((e.args as Record<string, unknown>).actualGasCost ?? 0)),
    0n,
  );

  const outcomes = { refunded: 0, split: 0, sellerWon: 0, open: 0 };
  for (const d of disputes) {
    if (d.status === "OPEN") outcomes.open++;
    else if (d.buyerShareBps === 10_000) outcomes.refunded++;
    else if (d.buyerShareBps === 0) outcomes.sellerWon++;
    else outcomes.split++;
  }

  return {
    network: env().mode,
    generatedAt: new Date().toISOString(),
    ...signals,
    seedDemoOrders,
    ordersByStatus: Object.fromEntries(orderGroups.map((g) => [g.status, g._count._all])),
    intents: intentGroups.map((g) => ({
      status: g.status,
      routeKind: g.routeKind,
      count: g._count._all,
    })),
    settlement: {
      fulfilledCount: durations.length,
      medianSeconds: durations.length ? durations[Math.floor(durations.length / 2)]! : null,
      p95Seconds: durations.length
        ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]!
        : null,
    },
    disputes: outcomes,
    gasSponsoredWei: gasSponsoredWei.toString(),
    sponsoredOps: gasEvents.length,
    recentIntents,
    recentEvents,
    chains,
    trustModel: {
      adapter: "attestation-committee-demo",
      attesters: "1-of-1 (operated by Trestle)",
      disclosure:
        "Cross-chain messages are authenticated by a trusted demo attestation committee, not a light client. Buyer funds on the source chain are always refundable after intent expiry + 30 min if no fulfilment is proven.",
    },
  };
}

/**
 * The public transparency figures, shared by every visitor for 15 s (aggregates only — no personal data), so an
 * open dashboard costs one set of queries per 15 s instead of one per viewer per poll.
 */
const cachedStats = unstable_cache(async () => encode(await protocolStats()), ["protocol-stats"], {
  revalidate: 15,
  tags: ["stats"],
});
export async function publicStats(): Promise<Awaited<ReturnType<typeof protocolStats>>> {
  if (!process.env.NEXT_RUNTIME) return protocolStats();
  return decode(await cachedStats());
}
