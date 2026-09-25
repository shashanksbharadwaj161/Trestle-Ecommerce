import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Lock, ShieldCheck, Star } from "lucide-react";
import { prisma } from "@trestle/db";
import { getProduct } from "@/server/products";
import { chainProfiles } from "@/server/chain";
import { Container } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { usd } from "@/lib/format";
import { PurchasePanel } from "./purchase-panel";
import { Gallery } from "./gallery";
import { CertificateViewer, type CertView } from "./certificates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await prisma.product.findUnique({
    where: { id },
    select: { title: true, description: true },
  });
  return p
    ? { title: p.title, description: p.description.slice(0, 160) }
    : { title: "Product not found" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product || product.status === "DRAFT") notFound();
  const chains = chainProfiles();

  const provenance = await prisma.chainEvent.findMany({
    where: {
      eventName: "ProvenanceRecorded",
      OR: product.certificates.map((c) => ({ chainId: c.chainId, address: c.contractAddress })),
    },
    orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
  });
  const certs: CertView[] = product.certificates.map((c) => ({
    id: c.id,
    tokenId: c.tokenId,
    chainId: c.chainId,
    contract: c.contractAddress,
    batch: c.batch,
    manufacturer: c.manufacturer,
    owner: c.ownerAddress,
    minter: c.minter,
    mintTxHash: c.mintTxHash,
    createdAt: c.createdAt.toISOString(),
    history: provenance
      .filter(
        (e) =>
          e.chainId === c.chainId &&
          String((e.args as Record<string, unknown>).tokenId) === c.tokenId,
      )
      .map((e) => {
        const a = e.args as Record<string, string>;
        return {
          from: a.from!,
          to: a.to!,
          at: e.blockTime?.toISOString() ?? null,
          txHash: e.txHash,
        };
      }),
  }));

  const payoutChain = chains.find((c) => c.chain.id === product.seller.payoutChainId);
  return (
    <Container>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground">
          Shop
        </Link>{" "}
        /{" "}
        <Link
          href={`/products?category=${encodeURIComponent(product.category)}`}
          className="hover:text-foreground"
        >
          {product.category}
        </Link>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery images={product.images} title={product.title} />
        <div>
          <p className="text-sm text-muted-foreground">
            {product.manufacturer ?? product.category}
          </p>
          <h1 className="mt-1 text-3xl font-semibold">{product.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="tabular text-2xl font-semibold">{usd(product.priceUsdMicros)}</span>
            {product.rating.count > 0 && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="size-4 fill-accent text-accent" aria-hidden />{" "}
                {product.rating.avg.toFixed(1)} ({product.rating.count} review
                {product.rating.count === 1 ? "" : "s"})
              </span>
            )}
            {certs.length > 0 && (
              <Badge tone="primary">
                <ShieldCheck /> {certs.length} on-chain certificate{certs.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <p className="mt-5 whitespace-pre-line text-muted-foreground">{product.description}</p>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 font-medium">
                  {product.seller.storefrontName}
                  {product.seller.verified && (
                    <BadgeCheck className="size-4 text-primary" aria-label="Verified seller" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Paid out on {payoutChain?.label ?? `chain ${product.seller.payoutChainId}`} ·
                  reputation{" "}
                  {product.seller.user.reputationScoreCache
                    ? Number(product.seller.user.reputationScoreCache).toFixed(1)
                    : "new"}
                </p>
              </div>
              {!product.seller.verified && <Badge tone="warning">Unverified seller</Badge>}
            </div>
          </div>

          <PurchasePanel
            product={{
              id: product.id,
              title: product.title,
              sellerId: product.sellerId,
              status: product.status,
              chainListingOptions: product.chainListingOptions,
              variants: product.variants.map((v) => ({
                id: v.id,
                name: v.name,
                stock: v.stock,
                sku: v.sku,
              })),
            }}
            chains={chains.map((c) => ({ id: c.chain.id, name: c.label }))}
          />

          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Your payment is
              held in escrow until you confirm delivery (or the delivery window ends).
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Open a
              dispute any time before the deadline — funds freeze until an arbiter decides.
            </li>
          </ul>
        </div>
      </div>

      <section className="mt-14" aria-labelledby="auth-heading">
        <h2 id="auth-heading" className="text-xl font-semibold">
          Authenticity &amp; provenance
        </h2>
        <CertificateViewer certs={certs} />
      </section>

      <section className="mt-14" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-xl font-semibold">
          Verified reviews
        </h2>
        {product.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No reviews yet. Only buyers with a completed order can review.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {product.reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`size-4 ${i < r.rating ? "fill-accent text-accent" : "text-border"}`}
                        aria-hidden
                      />
                    ))}
                  </span>
                  <Badge tone="success">Verified purchase</Badge>
                </div>
                {r.title && <p className="mt-2 font-medium">{r.title}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {r.author.displayName ?? `${r.author.walletAddress.slice(0, 8)}…`} ·{" "}
                  {r.createdAt.toLocaleDateString("en")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
