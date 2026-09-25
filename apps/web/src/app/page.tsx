import Link from "next/link";
import { ArrowRight, Fingerprint, Landmark, Route, ShieldCheck, Sparkles } from "lucide-react";
import { listProducts } from "@/server/products";
import { trustSignals } from "@/server/stats";
import { ProductCard, toCardData } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/format";
import { chainProfiles } from "@/server/chain";

export default async function Home() {
  const [featured, signals] = await Promise.all([
    listProducts({ sort: "featured", page: 1, pageSize: 8 }),
    trustSignals(),
  ]);
  const [A, B] = chainProfiles();

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_60%_at_80%_10%,var(--primary-soft),transparent_70%),radial-gradient(40%_50%_at_10%_90%,var(--accent-soft),transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-accent" aria-hidden /> Cross-chain checkout ·
              escrow · on-chain provenance
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
              Buy from any chain.
              <br />
              <span className="text-primary">Sell without limits.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Pay with what you hold on {A.shortName} or {B.shortName}. Sellers get their stablecoin
              on the chain they chose, funds wait in escrow until you confirm delivery, and every
              certified item carries its full ownership history on-chain.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/products">
                  Start shopping <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/admin/transparency">See live protocol data</Link>
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 self-center" aria-label="Live trust signals">
            {[
              {
                k: "Live escrows",
                v: signals.liveEscrows.toLocaleString(),
                hint: "funded orders awaiting delivery",
              },
              {
                k: "Volume settled",
                v: usd(signals.volumeSettledUsdMicros, { cents: false }),
                hint: "released to sellers on-chain",
              },
              {
                k: "Completed orders",
                v: signals.completedOrders.toLocaleString(),
                hint: "with on-chain release",
              },
              {
                k: "Contract events",
                v: signals.chainEvents.toLocaleString(),
                hint: "indexed & publicly auditable",
              },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-border bg-card p-5 shadow-card">
                <dt className="text-xs text-muted-foreground">{s.k}</dt>
                <dd className="tabular mt-1 text-2xl font-semibold">{s.v}</dd>
                <dd className="mt-1 text-xs text-muted-foreground">{s.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-labelledby="featured-heading">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="featured-heading" className="text-2xl font-semibold">
            Featured
          </h2>
          <Link href="/products" className="text-sm text-primary hover:underline">
            View all products
          </Link>
        </div>
        {featured.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No products yet. Run <code className="font-mono">pnpm seed</code> or list something from
            the seller dashboard.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {featured.items.map((p, i) => (
              <ProductCard key={p.id} p={toCardData(p)} priority={i < 4} />
            ))}
          </div>
        )}
      </section>

      <section className="border-y border-border bg-muted/40" aria-labelledby="how-heading">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 id="how-heading" className="text-2xl font-semibold">
            How Trestle protects every order
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              {
                icon: Route,
                t: "Chain-agnostic checkout",
                d: "Pay on your chain. A solver funds the seller's escrow from liquidity already on their chain and is repaid from your payment.",
              },
              {
                icon: Landmark,
                t: "Trustless escrow",
                d: "Funds release on your confirmation, automatically after the delivery deadline, or by arbitration if you dispute.",
              },
              {
                icon: ShieldCheck,
                t: "Authenticity NFTs",
                d: "Certified items carry an ERC-721 certificate with manufacturer, batch and every transfer since minting.",
              },
              {
                icon: Fingerprint,
                t: "Portable reputation",
                d: "Soulbound, time-decayed reputation built only from completed orders and dispute outcomes.",
              },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-xl border border-border bg-card p-5">
                <Icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-3 font-medium">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
