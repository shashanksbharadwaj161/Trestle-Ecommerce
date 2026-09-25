import Link from "next/link";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import { usd } from "@/lib/format";

export interface ProductCardData {
  id: string;
  title: string;
  images: string[];
  priceUsdMicros: string;
  category: string;
  seller: { storefrontName: string; verified: boolean };
  certificates: number;
  rating: { avg: number; count: number };
  inStock: boolean;
}

export function ProductCard({ p, priority }: { p: ProductCardData; priority?: boolean }) {
  return (
    <Link
      href={`/products/${p.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.images[0] ?? `/art/${p.id}?category=${encodeURIComponent(p.category)}`}
          alt=""
          loading={priority ? "eager" : "lazy"}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {p.certificates > 0 && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-[11px] font-medium text-primary backdrop-blur">
            <ShieldCheck className="size-3" aria-hidden /> Certified
          </span>
        )}
        {!p.inStock && (
          <span className="absolute right-2 top-2 rounded-full bg-foreground/85 px-2 py-0.5 text-[11px] font-medium text-background">
            Sold out
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs text-muted-foreground">{p.category}</p>
        <h3 className="line-clamp-2 font-medium leading-snug">{p.title}</h3>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {p.seller.storefrontName}
          {p.seller.verified && (
            <BadgeCheck className="size-3.5 text-primary" aria-label="Verified seller" />
          )}
        </p>
        <div className="mt-auto flex items-end justify-between pt-2">
          <span className="tabular text-lg font-semibold">{usd(p.priceUsdMicros)}</span>
          {p.rating.count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3.5 fill-accent text-accent" aria-hidden />
              {p.rating.avg.toFixed(1)} <span className="sr-only">out of 5,</span>({p.rating.count})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function toCardData(p: {
  id: string;
  title: string;
  images: string[];
  priceUsdMicros: bigint;
  category: string;
  seller: { storefrontName: string; verified: boolean };
  variants: { stock: number }[];
  _count: { certificates: number };
  rating: { avg: number; count: number };
}): ProductCardData {
  return {
    id: p.id,
    title: p.title,
    images: p.images,
    priceUsdMicros: p.priceUsdMicros.toString(),
    category: p.category,
    seller: p.seller,
    certificates: p._count.certificates,
    rating: p.rating,
    inStock: p.variants.some((v) => v.stock > 0),
  };
}
