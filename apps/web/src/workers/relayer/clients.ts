import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDeployment, type ChainProfile, type Deployment } from "@trestle/shared";
import type { RelayerConfig } from "./config";

export interface ChainCtx {
  profile: ChainProfile;
  chainId: number;
  dep: Deployment;
  client: PublicClient;
  wallet: WalletClient<Transport, Chain, Account>;
}

export function buildChains(cfg: RelayerConfig): Map<number, ChainCtx> {
  const account = privateKeyToAccount(cfg.relayerKey);
  const map = new Map<number, ChainCtx>();
  for (const profile of cfg.profiles) {
    const dep = getDeployment(cfg.mode, profile.chain.id);
    if (!dep)
      throw new Error(
        `No ${cfg.mode} deployment for chain ${profile.chain.id} — deploy contracts first`,
      );
    const transport = http(profile.rpcUrl, { timeout: 20_000, retryCount: 3 });
    const pollingInterval = profile.blockTimeSec <= 2 ? 500 : 3_000;
    map.set(profile.chain.id, {
      profile,
      chainId: profile.chain.id,
      dep,
      client: createPublicClient({
        chain: profile.chain,
        transport,
        pollingInterval,
      }) as PublicClient,
      wallet: createWalletClient({ account, chain: profile.chain, transport, pollingInterval }),
    });
  }
  return map;
}
