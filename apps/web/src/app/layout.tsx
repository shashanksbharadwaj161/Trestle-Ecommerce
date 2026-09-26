import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader, type HeaderCollection } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SegmentOutlet } from "@/components/segment-outlet";
import { publicConfig } from "@/server/env";
import { paymentAvailability } from "@/server/payments";
import { listCollections } from "@/server/catalog";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "Trestle — Dresses, denim and everyday jersey",
    template: "%s · Trestle",
  },
  description:
    "Trestle: dresses, shirting, jersey, denim and knitwear for women and men — considered pieces, made to be worn often.",
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
  const config = { ...publicConfig(), payments: paymentAvailability() };
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
              <SegmentOutlet>{children}</SegmentOutlet>
            </main>
            <SiteFooter crypto={config.payments.crypto} />
          </div>
        </Providers>
      </body>
    </html>
  );
}
