"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { WagmiProvider, useAccount } from "wagmi";
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { createSiweMessage } from "viem/siwe";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { buildWagmiConfig } from "@/lib/wagmi";
import { usePublicConfig } from "@/lib/public-config";
import { useSession } from "@/hooks/use-session";

function AuthLayer({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { user, loading } = useSession();
  const { address, isConnected } = useAccount();
  const { resolvedTheme } = useTheme();
  const signingOut = useRef(false);

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => (await api<{ nonce: string }>("/api/auth/nonce")).nonce,
        createMessage: ({ nonce, address, chainId }) =>
          createSiweMessage({
            domain: window.location.host,
            address,
            statement: "Sign in to Trestle. This signature does not send a transaction or cost gas.",
            uri: window.location.origin,
            version: "1",
            chainId,
            nonce,
            issuedAt: new Date(),
            expirationTime: new Date(Date.now() + 10 * 60_000),
          }),
        verify: async ({ message, signature }) => {
          try {
            const r = await api<{ linked: boolean }>("/api/auth/verify", { body: { message, signature } });
            await qc.invalidateQueries();
            toast.success(r.linked ? "Wallet linked to your account" : "Signed in with your wallet");
            return true;
          } catch (err) {
            toast.error((err as Error).message);
            return false;
          }
        },
        signOut: async () => {
          await api("/api/auth/logout", { body: {} });
          await qc.invalidateQueries();
        },
      }),
    [qc],
  );

  // A wallet session follows its wallet: if the connected account changes, end the old session.
  useEffect(() => {
    if (!user?.walletAddress || !isConnected || !address || signingOut.current) return;
    if (address.toLowerCase() !== user.walletAddress) {
      signingOut.current = true;
      api("/api/auth/logout", { body: {} })
        .then(() => qc.invalidateQueries())
        .then(() => toast.info("Wallet changed — please sign in again"))
        .finally(() => (signingOut.current = false));
    }
  }, [address, isConnected, user, qc]);

  // RainbowKit asks for a signature whenever the account has no verified wallet yet (sign-in or linking)
  const status = loading ? "loading" : user?.walletAddress ? "authenticated" : "unauthenticated";
  const rkTheme =
    resolvedTheme === "dark"
      ? darkTheme({ accentColor: "#eeece6", accentColorForeground: "#0f0f0e", borderRadius: "small" })
      : lightTheme({ accentColor: "#171614", borderRadius: "small" });

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <RainbowKitProvider theme={rkTheme} modalSize="compact" appInfo={{ appName: "Trestle" }}>
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function CryptoProviders({ children }: { children: React.ReactNode }) {
  const config = usePublicConfig();
  const [wagmiConfig] = useState(() => buildWagmiConfig(config));
  return (
    <WagmiProvider config={wagmiConfig}>
      <AuthLayer>{children}</AuthLayer>
    </WagmiProvider>
  );
}
