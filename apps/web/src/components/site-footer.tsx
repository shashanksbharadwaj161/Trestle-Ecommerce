import Link from "next/link";
import { LogoMark } from "./logo";

export function SiteFooter({ mode }: { mode: "local" | "testnet" }) {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-semibold">
            <LogoMark className="size-6" /> Trestle
          </div>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Buy from any chain. Sell without limits. Escrow-protected orders, on-chain authenticity
            and portable reputation.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            {mode === "testnet"
              ? "Testnet demo (Sepolia ↔ Base Sepolia) — tokens have no real value"
              : "Local demo (two Anvil chains) — tokens have no real value"}
          </p>
        </div>
        <nav aria-label="Footer: marketplace" className="text-sm">
          <h2 className="mb-2 font-medium">Marketplace</h2>
          <ul className="space-y-1.5 text-muted-foreground">
            <li>
              <Link href="/products" className="hover:text-foreground">
                All products
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:text-foreground">
                Cart
              </Link>
            </li>
            <li>
              <Link href="/account" className="hover:text-foreground">
                Your orders
              </Link>
            </li>
            <li>
              <Link href="/seller/onboarding" className="hover:text-foreground">
                Become a seller
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Footer: trust" className="text-sm">
          <h2 className="mb-2 font-medium">Trust</h2>
          <ul className="space-y-1.5 text-muted-foreground">
            <li>
              <Link href="/admin/transparency" className="hover:text-foreground">
                Transparency dashboard
              </Link>
            </li>
            <li>
              <Link href="/admin/transparency#trust-model" className="hover:text-foreground">
                Trust model &amp; disclosures
              </Link>
            </li>
            <li>
              <Link href="/account/loyalty" className="hover:text-foreground">
                Loyalty (TRST)
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
