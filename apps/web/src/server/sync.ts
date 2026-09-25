import "server-only";
import type { Hex } from "viem";
import { prisma } from "@trestle/db";
import { applyChainEvents, fetchTransactionEvents, type NormalizedEvent } from "@trestle/db/sync";
import { trestleAuthenticityAbi } from "@trestle/shared/abis";
import { env } from "./env";
import { publicClient, requireDeployment } from "./chain";
import { ApiError } from "./http";

/**
 * Pulls a mined transaction's receipt straight from the chain RPC and applies every Trestle event in it.
 * The client only points at a tx hash — all state comes from the chain, so a user cannot forge events.
 */
export async function syncTransaction(chainId: number, txHash: Hex, opts: { waitMs?: number } = {}) {
  requireDeployment(chainId);
  const client = publicClient(chainId);
  try {
    await client.waitForTransactionReceipt({ hash: txHash, timeout: opts.waitMs ?? 45_000, confirmations: 1 });
  } catch {
    throw new ApiError(404, "tx_not_found", "Transaction not found or not yet mined on this chain");
  }
  const { events, status } = await fetchTransactionEvents(client, env().mode, chainId, txHash);
  if (status !== "success") {
    return { status, applied: 0, events: [] as { eventName: string; status: string }[] };
  }
  const results = await applyChainEvents(prisma, events);
  await enrichCertificates(chainId, events);
  return {
    status,
    applied: results.filter((r) => r.status === "applied").length,
    events: results.map((r) => ({ eventName: r.eventName, status: r.status })),
  };
}

/** CertificateMinted doesn't carry manufacturer/metadata URI; read them from the contract. */
export async function enrichCertificates(chainId: number, events: NormalizedEvent[]) {
  const mints = events.filter((e) => e.contract === "authenticity" && e.eventName === "CertificateMinted");
  if (mints.length === 0) return;
  const dep = requireDeployment(chainId);
  for (const m of mints) {
    const tokenId = BigInt(String(m.args.tokenId));
    try {
      const cert = (await publicClient(chainId).readContract({
        address: dep.authenticity,
        abi: trestleAuthenticityAbi,
        functionName: "getCertificate",
        args: [tokenId],
      })) as { manufacturer: string; metadataURI: string; batch: string };
      await prisma.authenticityCertificate.updateMany({
        where: { chainId, contractAddress: dep.authenticity.toLowerCase(), tokenId: tokenId.toString() },
        data: { manufacturer: cert.manufacturer || null, metadataUri: cert.metadataURI, batch: cert.batch || null },
      });
    } catch (e) {
      console.warn("[sync] could not enrich certificate", tokenId, e);
    }
  }
}
