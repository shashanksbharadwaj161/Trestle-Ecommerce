import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { getChainProfiles, getDeployment, type ChainProfile, type Deployment } from "@trestle/shared";
import { env, serverRpc } from "./env";
import { ApiError } from "./http";

const g = globalThis as unknown as { __trestleClients?: Map<number, PublicClient> };

export function chainProfiles(): [ChainProfile, ChainProfile] {
  return getChainProfiles(env().mode, serverRpc());
}

export function chainProfile(chainId: number): ChainProfile | undefined {
  return chainProfiles().find((p) => p.chain.id === chainId);
}

export function supportedChainIds(): number[] {
  return chainProfiles().map((p) => p.chain.id);
}

export function publicClient(chainId: number): PublicClient {
  g.__trestleClients ??= new Map();
  const cached = g.__trestleClients.get(chainId);
  if (cached) return cached;
  const profile = chainProfile(chainId);
  if (!profile) throw new ApiError(400, "unsupported_chain", `Chain ${chainId} is not supported`);
  const client = createPublicClient({
    chain: profile.chain,
    transport: http(profile.rpcUrl, { timeout: 15_000, retryCount: 2 }),
    pollingInterval: profile.blockTimeSec <= 2 ? 500 : 2_000,
  }) as PublicClient;
  g.__trestleClients.set(chainId, client);
  return client;
}

export function deployment(chainId: number): Deployment | undefined {
  return getDeployment(env().mode, chainId);
}

export function requireDeployment(chainId: number): Deployment {
  const d = deployment(chainId);
  if (!d) {
    throw new ApiError(
      503,
      "contracts_not_deployed",
      `Trestle contracts are not deployed on chain ${chainId} for NETWORK_MODE=${env().mode}.`,
    );
  }
  return d;
}
