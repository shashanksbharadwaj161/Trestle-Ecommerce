import { defineChain, type Chain } from "viem";
import { baseSepolia, sepolia } from "viem/chains";

export type NetworkMode = "local" | "testnet";

export const trestleLocalA = defineChain({
  id: 31337,
  name: "Trestle Local A",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export const trestleLocalB = defineChain({
  id: 31338,
  name: "Trestle Local B",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8546"] } },
  testnet: true,
});

export interface ChainProfile {
  chain: Chain;
  /** "A" = default buyer/source chain, "B" = default seller payout/settlement chain */
  role: "A" | "B";
  label: string;
  shortName: string;
  rpcUrl: string;
  blockTimeSec: number;
  /** confirmations the relayer waits for before attesting a source-chain event */
  confirmations: number;
  explorerUrl?: string;
  isTestnetDemo: boolean;
  accent: string;
}

export interface RpcOverrides {
  chainARpcUrl?: string;
  chainBRpcUrl?: string;
}

export function parseNetworkMode(value: string | undefined | null): NetworkMode {
  return value === "testnet" ? "testnet" : "local";
}

export function getChainProfiles(mode: NetworkMode, rpc: RpcOverrides = {}): [ChainProfile, ChainProfile] {
  if (mode === "testnet") {
    return [
      {
        chain: sepolia,
        role: "A",
        label: "Ethereum Sepolia",
        shortName: "Sepolia",
        rpcUrl: rpc.chainARpcUrl || "https://ethereum-sepolia-rpc.publicnode.com",
        blockTimeSec: 12,
        confirmations: 3,
        explorerUrl: "https://sepolia.etherscan.io",
        isTestnetDemo: true,
        accent: "#627EEA",
      },
      {
        chain: baseSepolia,
        role: "B",
        label: "Base Sepolia",
        shortName: "Base Sepolia",
        rpcUrl: rpc.chainBRpcUrl || "https://sepolia.base.org",
        blockTimeSec: 2,
        confirmations: 5,
        explorerUrl: "https://sepolia.basescan.org",
        isTestnetDemo: true,
        accent: "#0052FF",
      },
    ];
  }
  return [
    {
      chain: trestleLocalA,
      role: "A",
      label: "Trestle Local A (Anvil)",
      shortName: "Local A",
      rpcUrl: rpc.chainARpcUrl || "http://127.0.0.1:8545",
      blockTimeSec: 1,
      confirmations: 1,
      isTestnetDemo: true,
      accent: "#7C3AED",
    },
    {
      chain: trestleLocalB,
      role: "B",
      label: "Trestle Local B (Anvil)",
      shortName: "Local B",
      rpcUrl: rpc.chainBRpcUrl || "http://127.0.0.1:8546",
      blockTimeSec: 1,
      confirmations: 1,
      isTestnetDemo: true,
      accent: "#0EA5E9",
    },
  ];
}

export function explorerTxUrl(profile: ChainProfile | undefined, txHash: string): string | undefined {
  return profile?.explorerUrl ? `${profile.explorerUrl}/tx/${txHash}` : undefined;
}

export function explorerAddressUrl(profile: ChainProfile | undefined, address: string): string | undefined {
  return profile?.explorerUrl ? `${profile.explorerUrl}/address/${address}` : undefined;
}
