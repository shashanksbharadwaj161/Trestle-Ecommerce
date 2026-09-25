import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { publicConfig } from "@/server/env";

export const metadata: Metadata = {
  title: {
    default: "Trestle — Buy from any chain. Sell without limits.",
    template: "%s · Trestle",
  },
  description:
    "Cross-chain-native marketplace with escrow-protected orders, on-chain authenticity certificates and portable soulbound reputation.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f13" },
  ],
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = publicConfig();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="skip-link rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers config={config}>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter mode={config.mode} />
          </div>
        </Providers>
      </body>
    </html>
  );
}
