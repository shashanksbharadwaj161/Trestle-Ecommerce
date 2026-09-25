import Link from "@/components/link";
import { HELP_LINKS, NAV } from "@/lib/nav";
import { Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function SiteFooter({ notice }: { notice: string | null }) {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="container-page grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-4">
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Dresses, jersey, denim and knits, made to be worn often. Pay by card, or with
            stablecoins held in escrow until your order arrives.
          </p>
          {notice && (
            <p className="mt-5 inline-flex max-w-sm items-start gap-2 border border-border px-3 py-2 text-xs text-muted-foreground">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
              {notice}
            </p>
          )}
        </div>
        <nav aria-label="Footer: shop" className="md:col-span-2">
          <h2 className="eyebrow mb-4 text-muted-foreground">Shop</h2>
          <ul className="space-y-2.5 text-sm">
            {NAV.map((g) => (
              <li key={g.href}>
                <Link href={g.href} className="hover:underline hover:underline-offset-4">
                  {g.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/new" className="hover:underline hover:underline-offset-4">
                New in
              </Link>
            </li>
            <li>
              <Link href="/collections" className="hover:underline hover:underline-offset-4">
                Collections
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Footer: help" className="md:col-span-2">
          <h2 className="eyebrow mb-4 text-muted-foreground">Help</h2>
          <ul className="space-y-2.5 text-sm">
            {HELP_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline hover:underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/order-status" className="hover:underline hover:underline-offset-4">
                Find a guest order
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Footer: company" className="md:col-span-2">
          <h2 className="eyebrow mb-4 text-muted-foreground">Trestle</h2>
          <ul className="space-y-2.5 text-sm">
            <li>
              <Link href="/account" className="hover:underline hover:underline-offset-4">
                Your account
              </Link>
            </li>
            <li>
              <Link href="/seller/onboarding" className="hover:underline hover:underline-offset-4">
                Sell on Trestle
              </Link>
            </li>
            <li>
              <Link href="/transparency" className="hover:underline hover:underline-offset-4">
                Escrow transparency
              </Link>
            </li>
            <li>
              <Link href="/account/loyalty" className="hover:underline hover:underline-offset-4">
                Loyalty (TRST)
              </Link>
            </li>
          </ul>
        </nav>
        <div className="md:col-span-2 md:justify-self-end">
          <ThemeToggle />
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-3 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getUTCFullYear()} Trestle. Demo storefront.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/credits" className="hover:text-foreground">
                Image credits
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
