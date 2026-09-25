import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma, toJsonSafe } from "@trestle/db";
import { CATEGORY_LABEL, DEPARTMENT_LABEL, SIZE_CHARTS, type Category, type Department } from "@trestle/shared";
import { getProductDetail, relatedProducts } from "@/server/catalog";
import { cardConfig } from "@/server/stripe";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ProductShelf } from "@/components/product-shelf";
import { RecentlyViewed } from "@/components/recently-viewed";
import type { CardData } from "@/components/product-card";
import { CertificateViewer, type CertView } from "./certificates";
import { PurchasePanel, type PdpProduct } from "./purchase-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await getProductDetail((await params).id);
  if (!p) return { title: "Product not found" };
  return {
    title: p.title,
    description: p.description.slice(0, 160),
    openGraph: { images: p.gallery[0] ? [{ url: p.gallery[0].url }] : undefined },
  };
}

const deptHref: Record<string, string> = { women: "/women", men: "/men", unisex: "/accessories" };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ colour?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const product = await getProductDetail(id);
  if (!product || product.status === "DRAFT") notFound();
  // canonical URL is the slug
  if (product.slug && id !== product.slug) {
    permanentRedirect(`/products/${product.slug}${sp.colour ? `?colour=${encodeURIComponent(sp.colour)}` : ""}`);
  }

  const provenance = product.certificates.length
    ? await prisma.chainEvent.findMany({
        where: {
          eventName: "ProvenanceRecorded",
          OR: product.certificates.map((c) => ({ chainId: c.chainId, address: c.contractAddress })),
        },
        orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
      })
    : [];
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
      .filter((e) => e.chainId === c.chainId && String((e.args as Record<string, unknown>).tokenId) === c.tokenId)
      .map((e) => {
        const a = e.args as Record<string, string>;
        return { from: a.from!, to: a.to!, at: e.blockTime?.toISOString() ?? null, txHash: e.txHash };
      }),
  }));

  const related = toJsonSafe(await relatedProducts(product)) as unknown as CardData[];
  const dept = (product.department ?? "unisex") as Department;
  const cat = product.category as Category;
  const chart = product.sizeChartKey ? SIZE_CHARTS[product.sizeChartKey] ?? null : null;
  const soldOut = product.status !== "ACTIVE";

  const pdp: PdpProduct = {
    id: product.id,
    slug: product.slug ?? product.id,
    title: product.title,
    description: product.description,
    priceUsdMicros: product.priceUsdMicros.toString(),
    department: dept,
    category: cat,
    subcategory: product.subcategory,
    material: product.material,
    fit: product.fit,
    care: product.care,
    isNew: product.isNew,
    archived: soldOut,
    seller: { name: product.seller.storefrontName, verified: product.seller.verified },
    gallery: product.gallery.map((g) => ({ url: g.url, alt: g.alt, colour: g.colour })),
    variants: product.variants.map((v) => ({
      id: v.id,
      colour: v.colour ?? "Default",
      colourHex: v.colourHex,
      size: v.size ?? "One size",
      stock: v.stock,
      sku: v.sku,
    })),
    chart,
    certificates: certs.length,
    rating: product.rating,
    cardEnabled: cardConfig().enabled,
    stablecoin: product.chainListingOptions.length > 0,
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.gallery.map((g) => g.url),
    sku: product.variants[0]?.sku,
    brand: { "@type": "Brand", name: "Trestle" },
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: (Number(product.priceUsdMicros) / 1e6).toFixed(2),
      availability: product.variants.some((v) => v.stock > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container-page pt-4 md:pt-6">
        <Breadcrumb
          items={[
            { label: DEPARTMENT_LABEL[dept], href: deptHref[dept] },
            { label: CATEGORY_LABEL[cat] ?? product.category, href: `${deptHref[dept]}?category=${cat}` },
            { label: product.title },
          ]}
        />
      </div>
      <PurchasePanel product={pdp} initialColour={sp.colour} />

      {product.reviews.length > 0 && (
        <section aria-labelledby="reviews" className="container-page mt-20">
          <h2 id="reviews" className="text-xl">
            Reviews <span className="text-muted-foreground">({product.rating.count})</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reviews can only be written after a completed purchase. Average {product.rating.avg.toFixed(1)} / 5.
          </p>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {product.reviews.map((r) => (
              <li key={r.id} className="py-5">
                <p className="text-sm" aria-label={`${r.rating} out of 5`}>
                  {"★".repeat(r.rating)}
                  <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                </p>
                {r.title && <p className="mt-2 font-medium">{r.title}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.author.displayName ?? "Verified buyer"} · verified purchase
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {certs.length > 0 && (
        <section aria-labelledby="provenance" className="container-page mt-20">
          <h2 id="provenance" className="text-xl">Provenance record</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The seller minted an on-chain certificate for this item. It records who issued it and every transfer —
            it is a record kept by the seller, not an independent certification.{" "}
            <Link href="/payments#provenance" className="underline underline-offset-4">
              How provenance works
            </Link>
          </p>
          <CertificateViewer certs={certs} />
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related" className="reveal mt-20 md:mt-28">
          <h2 id="related" className="container-page mb-6 text-xl">
            You may also like
          </h2>
          <ProductShelf items={related} label="You may also like" />
        </section>
      )}
      <RecentlyViewed track={product.id} exclude={product.id} />
    </>
  );
}
