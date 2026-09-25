import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader, type HeaderCollection } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { publicConfig } from "@/server/env";
import { cardConfig } from "@/server/stripe";
import { listCollections } from "@/server/catalog";

export const metadata: Metadata = {
  title: {
    default: "Trestle — Dresses, denim and everyday jersey",
    template: "%s · Trestle",
  },
  description:
    "Trestle: dresses, jersey tees, denim and knit hats for women and men. Pay by card, or with stablecoins held in escrow until delivery.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

export const dynamic = "force-dynamic";

async function headerCollections(): Promise<HeaderCollection[]> {
  try {
    const rows = await listCollections();
    return rows.map((c) => ({ slug: c.slug, title: c.title, image: c.image }));
  } catch (err) {
    // the shell must render even if the database is briefly unavailable
    console.error("[layout] collections unavailable", (err as Error).message);
    return [];
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = publicConfig();
  const card = cardConfig();
  const notice =
    card.mode === "live"
      ? null
      : card.enabled
        ? "Demo store: card payments run in Stripe test mode — no real charges, no goods shipped."
        : "Demo store: card payments are not configured yet, so orders cannot be paid by card.";
  const collections = await headerCollections();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link bg-foreground px-3 py-2 text-sm text-background">
          Skip to content
        </a>
        <Providers config={config}>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader collections={collections} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter notice={notice} />
          </div>
        </Providers>
      </body>
    </html>
  );
}
