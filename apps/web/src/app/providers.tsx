"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PublicConfigProvider, type ClientConfig } from "@/lib/public-config";
import { WishlistSync } from "@/hooks/use-wishlist";

/**
 * Storefront providers. Wallet libraries (wagmi / RainbowKit) are NOT loaded here — they live in
 * <CryptoProviders>, mounted only by the routes that need a wallet, so shopping stays light.
 */
export function Providers({ config, children }: { config: ClientConfig; children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } },
      }),
  );
  return (
    <PublicConfigProvider value={config}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          {children}
          <WishlistSync />
          <Toaster closeButton position="bottom-center" toastOptions={{ className: "!rounded-[4px]" }} />
        </QueryClientProvider>
      </ThemeProvider>
    </PublicConfigProvider>
  );
}
