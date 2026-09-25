import { defineChain, type Chain } from "viem";

// Defined here (rather than imported from "viem/chains") so client bundles don't pull in every chain definition.
const multicall3 = {
  address: "0xcA11bde05977b3631167028862bE2a173976CA11",
  blockCreated: 1,
} as const;

export const sepolia = defineChain({
  id: 11_155_111,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
  contracts: { multicall3: { ...multicall3, blockCreated: 751_532 } },
  testnet: true,
});

export const baseSepolia = defineChain({
  id: 84_532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
  contracts: { multicall3: { ...multicall3, blockCreated: 1_059_647 } },
  testnet: true,
});

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

export function getChainProfiles(
  mode: NetworkMode,
  rpc: RpcOverrides = {},
): [ChainProfile, ChainProfile] {
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

export function explorerTxUrl(
  profile: ChainProfile | undefined,
  txHash: string,
): string | undefined {
  return profile?.explorerUrl ? `${profile.explorerUrl}/tx/${txHash}` : undefined;
}

export function explorerAddressUrl(
  profile: ChainProfile | undefined,
  address: string,
): string | undefined {
  return profile?.explorerUrl ? `${profile.explorerUrl}/address/${address}` : undefined;
}
