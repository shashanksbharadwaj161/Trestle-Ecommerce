import { decodeEventLog, type Abi, type Log, type PublicClient } from "viem";
import { getDeployment, type Deployment, type NetworkMode } from "@trestle/shared";
import {
  trestleEscrowAbi,
  trestlePaymentRouterAbi,
  trestleReputationAbi,
  trestleLoyaltyAbi,
  trestleAuthenticityAbi,
  trestlePaymasterAbi,
} from "@trestle/shared/abis";
import { toJsonSafe } from "../json";
import type { ContractKey, NormalizedEvent } from "./types";

const ABIS: Record<ContractKey, Abi> = {
  escrow: trestleEscrowAbi as Abi,
  paymentRouter: trestlePaymentRouterAbi as Abi,
  reputation: trestleReputationAbi as Abi,
  loyalty: trestleLoyaltyAbi as Abi,
  authenticity: trestleAuthenticityAbi as Abi,
  paymaster: trestlePaymasterAbi as Abi,
};

/** Events the indexer persists. Everything else (e.g. ERC-20/721 Transfer, RoleGranted) is skipped. */
export const INDEXED_EVENTS: Record<ContractKey, readonly string[]> = {
  escrow: [
    "OrderCreated",
    "DeliveryConfirmed",
    "FundsReleased",
    "DisputeRaised",
    "DisputeResolved",
    "OrderRefunded",
    "HookFailed",
  ],
  paymentRouter: [
    "IntentCreated",
    "IntentFulfilled",
    "IntentSettled",
    "IntentFailed",
    "DirectCheckout",
    "LiquidityDeposited",
    "LiquidityWithdrawn",
  ],
  reputation: ["ReputationEventRecorded"],
  loyalty: ["RewardMinted", "Staked", "Unstaked", "RewardsClaimed"],
  authenticity: ["CertificateMinted", "ProvenanceRecorded"],
  paymaster: ["GasSponsored"],
};

export function contractAddresses(dep: Deployment): Record<ContractKey, `0x${string}`> {
  return {
    escrow: dep.escrow,
    paymentRouter: dep.paymentRouter,
    reputation: dep.reputation,
    loyalty: dep.loyalty,
    authenticity: dep.authenticity,
    paymaster: dep.paymaster,
  };
}

export function decodeTrestleLogs(
  mode: NetworkMode,
  chainId: number,
  logs: Log[],
  blockTimes: Map<bigint, Date> = new Map(),
): NormalizedEvent[] {
  const dep = getDeployment(mode, chainId);
  if (!dep) return [];
  const byAddress = new Map<string, ContractKey>();
  for (const [key, addr] of Object.entries(contractAddresses(dep)) as [ContractKey, string][]) {
    byAddress.set(addr.toLowerCase(), key);
  }
  const out: NormalizedEvent[] = [];
  for (const log of logs) {
    const key = byAddress.get(log.address.toLowerCase());
    if (!key || log.transactionHash == null || log.logIndex == null || log.blockNumber == null)
      continue;
    try {
      const decoded = decodeEventLog({
        abi: ABIS[key],
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      if (!decoded.eventName || !INDEXED_EVENTS[key].includes(decoded.eventName)) continue;
      const bt = blockTimes.get(log.blockNumber);
      out.push({
        chainId,
        contract: key,
        address: log.address.toLowerCase(),
        eventName: decoded.eventName,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber.toString(),
        blockTime: bt ? bt.toISOString() : null,
        args: toJsonSafe(decoded.args ?? {}) as Record<string, unknown>,
      });
    } catch {
      // not one of our events (or anonymous) — ignore
    }
  }
  out.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)),
  );
  return out;
}

/** Fetches and decodes every indexed Trestle event on `chainId` in [fromBlock, toBlock]. */
export async function fetchTrestleEvents(
  client: PublicClient,
  mode: NetworkMode,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<NormalizedEvent[]> {
  const dep = getDeployment(mode, chainId);
  if (!dep || toBlock < fromBlock) return [];
  const logs = await client.getLogs({
    address: Object.values(contractAddresses(dep)),
    fromBlock,
    toBlock,
  });
  const blockTimes = await resolveBlockTimes(client, logs);
  return decodeTrestleLogs(mode, chainId, logs as Log[], blockTimes);
}

/** Decodes the Trestle events emitted by a single (already mined) transaction. */
export async function fetchTransactionEvents(
  client: PublicClient,
  mode: NetworkMode,
  chainId: number,
  txHash: `0x${string}`,
): Promise<{
  events: NormalizedEvent[];
  status: "success" | "reverted";
  blockNumber: bigint;
  from: string;
}> {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const blockTimes = await resolveBlockTimes(client, receipt.logs as Log[]);
  return {
    events: decodeTrestleLogs(mode, chainId, receipt.logs as Log[], blockTimes),
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    from: receipt.from.toLowerCase(),
  };
}

async function resolveBlockTimes(client: PublicClient, logs: Log[]): Promise<Map<bigint, Date>> {
  const blocks = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b != null))];
  const map = new Map<bigint, Date>();
  await Promise.all(
    blocks.slice(0, 200).map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: bn });
        map.set(bn, new Date(Number(block.timestamp) * 1000));
      } catch {
        /* timestamps are cosmetic */
      }
    }),
  );
  return map;
}
