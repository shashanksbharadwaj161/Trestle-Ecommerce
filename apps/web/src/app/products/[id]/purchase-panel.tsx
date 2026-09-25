"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Ruler } from "lucide-react";
import { toast } from "sonner";
import { sortSizes, type SizeChart } from "@trestle/shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Price } from "@/components/price";
import { SizeChartTable } from "@/components/size-guide";
import { SizeFinder } from "@/components/size-finder";
import { Check } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUi } from "@/store/ui";
import { POLICY } from "@/lib/policy";
import { cn } from "@/lib/cn";
import { Gallery } from "./gallery";

export interface PdpProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceUsdMicros: string;
  department: string;
  category: string;
  subcategory: string | null;
  material: string | null;
  fit: string | null;
  care: string[];
  isNew: boolean;
  archived: boolean;
  seller: { name: string; verified: boolean };
  gallery: { url: string; alt: string; colour: string | null }[];
  variants: {
    id: string;
    colour: string;
    colourHex: string | null;
    size: string;
    stock: number;
    sku: string;
  }[];
  chart: SizeChart | null;
  certificates: number;
  rating: { avg: number; count: number };
  cardEnabled: boolean;
  stablecoin: boolean;
}

export function PurchasePanel({
  product,
  initialColour,
}: {
  product: PdpProduct;
  initialColour?: string;
}) {
  const colours = useMemo(() => {
    const seen = new Map<string, { name: string; hex: string | null; inStock: boolean }>();
    for (const v of product.variants) {
      const c = seen.get(v.colour) ?? { name: v.colour, hex: v.colourHex, inStock: false };
      c.inStock ||= v.stock > 0;
      seen.set(v.colour, c);
    }
    return [...seen.values()];
  }, [product.variants]);
  const firstInStock = colours.find((c) => c.inStock)?.name ?? colours[0]?.name ?? "Default";
  const [colour, setColour] = useState(
    initialColour && colours.some((c) => c.name === initialColour) ? initialColour : firstInStock,
  );
  const sizes = useMemo(
    () => sortSizes([...new Set(product.variants.map((v) => v.size))]),
    [product.variants],
  );
  const oneSize = sizes.length === 1;
  const [size, setSize] = useState<string | null>(oneSize ? sizes[0]! : null);
  const [sizeError, setSizeError] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const cart = useCart();
  const setBag = useUi((s) => s.setBag);
  const wishlist = useWishlist();
  const hydrated = useHydrated();
  const saved = hydrated && wishlist.has(product.id);
  const addRef = useRef<HTMLDivElement>(null);
  const sizesRef = useRef<HTMLFieldSetElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  const variant = product.variants.find((v) => v.colour === colour && v.size === size) ?? null;
  const colourSoldOut = !colours.find((c) => c.name === colour)?.inStock;
  const images = useMemo(() => {
    const own = product.gallery.filter((g) => g.colour === colour);
    const shared = product.gallery.filter((g) => !g.colour);
    const list = own.length ? [...own, ...shared] : product.gallery;
    return list.map(({ url, alt }) => ({ url, alt }));
  }, [product.gallery, colour]);

  // keep ?colour= in the URL (shareable, survives reload) without a navigation
  useEffect(() => {
    const url = new URL(window.location.href);
    if (colour === firstInStock) url.searchParams.delete("colour");
    else url.searchParams.set("colour", colour);
    window.history.replaceState(null, "", url.toString());
  }, [colour, firstInStock]);

  // mobile sticky add-to-bag once the main button has scrolled above the viewport.
  // (a scroll listener, not IntersectionObserver: a fast fling can jump from below to above the viewport
  // without the element ever intersecting, which never fires an IO callback)
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = addRef.current;
      if (el) setShowSticky(el.getBoundingClientRect().bottom < 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  async function addToBag() {
    if (!variant) {
      setSizeError(true);
      sizesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      sizesRef.current
        ?.querySelector<HTMLButtonElement>("button:not([disabled])")
        ?.focus({ preventScroll: true });
      return;
    }
    setAdding(true);
    try {
      await cart.add(variant.id, 1);
      toast.success(`Added to bag — ${product.title}, ${colour}${oneSize ? "" : `, size ${size}`}`);
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
      setBag(true);
    } finally {
      setAdding(false);
    }
  }

  const cta = product.archived
    ? "No longer available"
    : colourSoldOut
      ? "Sold out in this colour"
      : variant && variant.stock <= 0
        ? "Sold out in this size"
        : !variant
          ? "Select a size"
          : "Add to bag";
  const ctaDisabled =
    product.archived || colourSoldOut || (!!variant && variant.stock <= 0) || adding;

  return (
    <div className="mt-4 md:container-page md:mt-6 md:grid md:grid-cols-12 md:gap-10 xl:gap-16">
      <div className="md:col-span-7">
        <Gallery images={images} title={product.title} />
      </div>

      <div className="container-page md:col-span-5 md:px-0">
        <div className="sticky-under-header pt-6 md:sticky md:top-[calc(var(--header-offset)+2rem)] md:pt-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              {product.isNew && <p className="eyebrow mb-2 text-accent">New</p>}
              <h1 className="text-[1.5rem] leading-tight tracking-[-0.02em] md:text-[1.75rem]">
                {product.title}
              </h1>
              <Price micros={product.priceUsdMicros} className="mt-2 block text-[1.0625rem]" />
            </div>
            <button
              type="button"
              aria-pressed={saved}
              aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
              onClick={async () =>
                toast(
                  (await wishlist.toggle(product.id))
                    ? "Saved to wishlist"
                    : "Removed from wishlist",
                )
              }
              className="-mr-2 grid size-11 shrink-0 place-items-center"
            >
              <Heart className={cn("size-5", saved && "fill-foreground")} strokeWidth={1.5} />
            </button>
          </div>

          {/* colour */}
          <fieldset className="mt-7">
            <legend className="text-[0.8125rem]">
              Colour: <span className="text-muted-foreground">{colour}</span>
              {colourSoldOut && <span className="ml-2 text-muted-foreground">— sold out</span>}
            </legend>
            {colours.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Colour">
                {colours.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    role="radio"
                    aria-checked={c.name === colour}
                    aria-label={`${c.name}${c.inStock ? "" : ", sold out"}`}
                    title={c.name}
                    onClick={() => {
                      setColour(c.name);
                      setSizeError(false);
                    }}
                    className="grid size-11 place-items-center"
                  >
                    <span
                      className={cn(
                        "relative block size-7 rounded-full ring-1 ring-foreground/15 ring-offset-[3px] ring-offset-background transition-shadow",
                        c.name === colour && "ring-foreground",
                      )}
                      style={{ background: c.hex ?? "var(--muted)" }}
                    >
                      {!c.inStock && (
                        <span
                          className="absolute left-1/2 top-1/2 h-px w-9 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-foreground/70"
                          aria-hidden
                        />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          {/* size */}
          {!oneSize && (
            <fieldset
              ref={sizesRef}
              className="mt-6"
              aria-describedby={sizeError ? "size-error" : undefined}
            >
              <div className="flex items-center justify-between">
                <legend className="text-[0.8125rem]">
                  Size{size ? <span className="text-muted-foreground">: {size}</span> : null}
                </legend>
                {product.chart && (
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="flex h-9 items-center gap-1.5 text-[0.8125rem] underline underline-offset-4"
                  >
                    <Ruler className="size-4" strokeWidth={1.5} /> Size guide
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Size">
                {sizes.map((s) => {
                  const v = product.variants.find((x) => x.colour === colour && x.size === s);
                  const available = !!v && v.stock > 0;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={size === s}
                      aria-disabled={!available}
                      aria-label={`Size ${s}${available ? (v!.stock <= 3 ? `, only ${v!.stock} left` : "") : ", sold out"}`}
                      disabled={!available}
                      onClick={() => {
                        setSize(s);
                        setSizeError(false);
                      }}
                      className={cn(
                        "relative h-11 border text-sm transition-colors",
                        size === s
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground",
                        !available &&
                          "cursor-not-allowed border-border text-muted-foreground line-through hover:border-border",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {sizeError && (
                <p id="size-error" role="alert" className="mt-2 text-[0.8125rem] text-danger">
                  Please choose a size.
                </p>
              )}
              {variant && variant.stock > 0 && variant.stock <= 3 && (
                <p className="mt-2 text-[0.8125rem] text-accent">
                  Only {variant.stock} left in this size.
                </p>
              )}
            </fieldset>
          )}

          <div ref={addRef} className="mt-7 flex gap-2">
            <Button
              size="lg"
              className="flex-1"
              onClick={addToBag}
              disabled={ctaDisabled}
              loading={adding}
            >
              {added ? (
                <>
                  <Check className="animate-pop" /> Added to bag
                </>
              ) : (
                cta
              )}
            </Button>
          </div>
          <p className="mt-3 text-[0.8125rem] text-muted-foreground">
            Free standard delivery over {POLICY.freeDeliveryOver} · {POLICY.returnDays}-day returns
          </p>

          <Accordion
            type="multiple"
            defaultValue={["details"]}
            className="mt-8 border-t border-border"
          >
            <AccordionItem value="details">
              <AccordionTrigger>Details</AccordionTrigger>
              <AccordionContent>
                <p>{product.description}</p>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[0.8125rem]">
                  {product.subcategory && (
                    <>
                      <dt className="text-foreground">Style</dt>
                      <dd>{product.subcategory}</dd>
                    </>
                  )}
                  <dt className="text-foreground">Sold by</dt>
                  <dd>{product.seller.name}</dd>
                  {variant && (
                    <>
                      <dt className="text-foreground">SKU</dt>
                      <dd className="tabular">{variant.sku}</dd>
                    </>
                  )}
                </dl>
              </AccordionContent>
            </AccordionItem>
            {(product.fit || product.chart) && (
              <AccordionItem value="fit">
                <AccordionTrigger>Size &amp; fit</AccordionTrigger>
                <AccordionContent>
                  {product.fit && <p>{product.fit}</p>}
                  {product.chart && (
                    <button
                      type="button"
                      onClick={() => setGuideOpen(true)}
                      className="mt-3 text-foreground underline underline-offset-4"
                    >
                      View measurements
                    </button>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}
            {(product.material || product.care.length > 0) && (
              <AccordionItem value="care">
                <AccordionTrigger>Material &amp; care</AccordionTrigger>
                <AccordionContent>
                  {product.material && <p>{product.material}</p>}
                  {product.care.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5">
                      {product.care.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href="/care"
                    className="mt-3 inline-block text-foreground underline underline-offset-4"
                  >
                    Garment care guide
                  </Link>
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="delivery">
              <AccordionTrigger>Delivery &amp; returns</AccordionTrigger>
              <AccordionContent>
                <p>{POLICY.standard}</p>
                <p className="mt-2">{POLICY.express}</p>
                <p className="mt-2">{POLICY.returns}</p>
                <div className="mt-3 flex gap-4">
                  <Link href="/delivery" className="text-foreground underline underline-offset-4">
                    Delivery
                  </Link>
                  <Link href="/returns" className="text-foreground underline underline-offset-4">
                    Returns
                  </Link>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="payment">
              <AccordionTrigger>Payment options</AccordionTrigger>
              <AccordionContent>
                <p>
                  {product.cardEnabled
                    ? "Pay by card on Stripe’s secure checkout — no account needed."
                    : "Card payments are not configured on this deployment yet."}
                </p>
                {product.stablecoin && (
                  <p className="mt-2">
                    Or pay with stablecoins: your payment is held in an escrow contract and released
                    to the seller when you confirm delivery.
                  </p>
                )}
                {product.certificates > 0 && (
                  <p className="mt-2">
                    This item has a seller-issued on-chain provenance record (see below).
                  </p>
                )}
                <Link
                  href="/payments"
                  className="mt-3 inline-block text-foreground underline underline-offset-4"
                >
                  How payments work
                </Link>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* mobile sticky add-to-bag */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden",
          showSticky ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!showSticky}
        inert={!showSticky || undefined}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem]">{product.title}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              <Price micros={product.priceUsdMicros} /> · {colour}
              {size && !oneSize ? ` · ${size}` : ""}
            </p>
          </div>
          <Button onClick={addToBag} disabled={ctaDisabled} loading={adding} className="shrink-0">
            {variant ? "Add to bag" : "Select size"}
          </Button>
        </div>
      </div>

      {product.chart && (
        <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
          <DialogContent title="Size guide" description={product.title} className="max-w-xl">
            <SizeFinder
              chart={product.chart}
              available={product.variants
                .filter((v) => v.colour === colour && v.stock > 0)
                .map((v) => v.size)}
              onPick={(s) => {
                setSize(s);
                setSizeError(false);
                setGuideOpen(false);
              }}
            />
            <div className="mt-6">
              <SizeChartTable chart={product.chart} highlight={size} />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Between sizes? {product.fit ?? "Choose the larger size for a relaxed fit."}{" "}
              <Link href="/size-guide" className="underline underline-offset-4">
                Full size guide
              </Link>
            </p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
