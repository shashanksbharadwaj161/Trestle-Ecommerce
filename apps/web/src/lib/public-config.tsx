"use client";
import { createContext, useContext } from "react";
import { getChainProfiles, type ChainProfile, type NetworkMode } from "@trestle/shared";

export interface ClientConfig {
  mode: NetworkMode;
  rpc: { chainARpcUrl?: string; chainBRpcUrl?: string };
  walletConnectProjectId: string;
  protocolFeeBps: number;
}

const Ctx = createContext<ClientConfig | null>(null);

export function PublicConfigProvider({
  value,
  children,
}: {
  value: ClientConfig;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePublicConfig(): ClientConfig {
  const c = useContext(Ctx);
  if (!c) throw new Error("PublicConfigProvider missing");
  return c;
}

export function useChainProfiles(): [ChainProfile, ChainProfile] {
  const c = usePublicConfig();
  return getChainProfiles(c.mode, c.rpc);
}

export function useChainName() {
  const profiles = useChainProfiles();
  return (id: number | null | undefined) =>
    profiles.find((p) => p.chain.id === id)?.shortName ?? (id ? `Chain ${id}` : "—");
}
