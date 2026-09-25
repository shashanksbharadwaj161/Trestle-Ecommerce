"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { WagmiProvider, useAccount } from "wagmi";
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { createSiweMessage } from "viem/siwe";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/api";
import { buildWagmiConfig } from "@/lib/wagmi";
import { PublicConfigProvider, type ClientConfig } from "@/lib/public-config";
import { useSession } from "@/hooks/use-session";
import { useLocalCart } from "@/store/local-cart";

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
            statement:
              "Sign in to Trestle. This signature does not send a transaction or cost gas.",
            uri: window.location.origin,
            version: "1",
            chainId,
            nonce,
            issuedAt: new Date(),
            expirationTime: new Date(Date.now() + 10 * 60_000),
          }),
        verify: async ({ message, signature }) => {
          try {
            await api("/api/auth/verify", { body: { message, signature } });
            const local = useLocalCart.getState();
            if (local.lines.length) {
              await api("/api/cart", { body: { op: "merge", items: local.lines } }).catch(
                () => undefined,
              );
              local.clear();
            }
            await qc.invalidateQueries();
            toast.success("Signed in");
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

  // If the wallet switches to a different account, end the old session instead of acting on its behalf.
  useEffect(() => {
    if (!user || !isConnected || !address || signingOut.current) return;
    if (address.toLowerCase() !== user.walletAddress) {
      signingOut.current = true;
      api("/api/auth/logout", { body: {} })
        .then(() => qc.invalidateQueries())
        .then(() => toast.info("Wallet changed — please sign in again"))
        .finally(() => (signingOut.current = false));
    }
  }, [address, isConnected, user, qc]);

  const status = loading ? "loading" : user ? "authenticated" : "unauthenticated";
  const rkTheme =
    resolvedTheme === "dark"
      ? darkTheme({
          accentColor: "#4fc3b4",
          accentColorForeground: "#06201d",
          borderRadius: "medium",
        })
      : lightTheme({ accentColor: "#0f5e57", borderRadius: "medium" });

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <RainbowKitProvider theme={rkTheme} modalSize="compact" appInfo={{ appName: "Trestle" }}>
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function Providers({
  config,
  children,
}: {
  config: ClientConfig;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } },
      }),
  );
  const [wagmiConfig] = useState(() => buildWagmiConfig(config));
  return (
    <PublicConfigProvider value={config}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <AuthLayer>{children}</AuthLayer>
            <Toaster richColors closeButton position="bottom-right" />
          </QueryClientProvider>
        </WagmiProvider>
      </ThemeProvider>
    </PublicConfigProvider>
  );
}
