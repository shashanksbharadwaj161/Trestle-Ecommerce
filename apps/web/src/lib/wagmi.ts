import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { getChainProfiles } from "@trestle/shared";
import type { ClientConfig } from "./public-config";

export function buildWagmiConfig(cfg: ClientConfig) {
  const profiles = getChainProfiles(cfg.mode, cfg.rpc);
  const chains = profiles.map((p) => ({
    ...p.chain,
    rpcUrls: { ...p.chain.rpcUrls, default: { http: [p.rpcUrl] } },
  })) as unknown as readonly [
    ReturnType<typeof getChainProfiles>[0]["chain"],
    ReturnType<typeof getChainProfiles>[1]["chain"],
  ];
  const hasWc = cfg.walletConnectProjectId.length > 0;
  const connectors = connectorsForWallets(
    [
      {
        groupName: "Wallets",
        wallets: hasWc
          ? [injectedWallet, metaMaskWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
          : [injectedWallet, coinbaseWallet],
      },
    ],
    {
      appName: "Trestle",
      projectId: hasWc ? cfg.walletConnectProjectId : "walletconnect-disabled",
    },
  );
  return createConfig({
    chains,
    connectors,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: Object.fromEntries(profiles.map((p) => [p.chain.id, http(p.rpcUrl)])),
  });
}
