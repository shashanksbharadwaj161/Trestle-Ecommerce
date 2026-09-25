"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortAddress } from "@/lib/format";

/** Wallet connect + SIWE sign-in (RainbowKit authentication adapter). */
export function ConnectWallet({
  size = "md",
  label = "Connect & sign in",
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openConnectModal,
        openAccountModal,
        openChainModal,
        mounted,
        authenticationStatus,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain && authenticationStatus === "authenticated";
        if (!ready)
          return (
            <Button size={size} variant="outline" disabled aria-hidden>
              …
            </Button>
          );
        if (!connected) {
          return (
            <Button size={size} onClick={openConnectModal}>
              <Wallet /> {label}
            </Button>
          );
        }
        if (chain.unsupported) {
          return (
            <Button size={size} variant="danger" onClick={openChainModal}>
              Wrong network
            </Button>
          );
        }
        return (
          <Button
            size={size}
            variant="outline"
            onClick={openAccountModal}
            aria-label={`Wallet ${account.address}`}
          >
            <span className="size-2 rounded-full bg-success" aria-hidden />
            {account.ensName ?? shortAddress(account.address)}
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}
