"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useWishlist } from "@/hooks/use-wishlist";
import { useHydrated } from "@/hooks/use-hydrated";
import { useCart } from "@/hooks/use-cart";
import { useUi } from "@/store/ui";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Price } from "./price";
import { navigateWithTransition } from "@/lib/view-transition";

/** JSON form of server/catalog.ts ProductCard. */
export interface CardData {
  id: string;
  slug: string;
  href: string;
  title: string;
  priceUsdMicros: string;
  department: string | null;
  category: string;
  subcategory: string | null;
  isNew: boolean;
  soldOut: boolean;
  status?: string;
  colours: {
    name: string;
    hex: string | null;
    image: string | null;
    altImage: string | null;
    alt: string;
    inStock: boolean;
  }[];
  sizes: { size: string; variants: { colour: string; variantId: string; stock: number }[] }[];
}

const MAX_SWATCHES = 4;

export function ProductCard({
  p,
  priority,
  sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw",
}: {
  p: CardData;
  priority?: boolean;
  sizes?: string;
}) {
  const [colourIdx, setColourIdx] = useState(0);
  const router = useRouter();
  const media = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const colour = p.colours[colourIdx] ?? p.colours[0];
  const wishlist = useWishlist();
  const hydrated = useHydrated();
  const saved = hydrated && wishlist.has(p.id);
  const href =
    colourIdx > 0 && colour ? `${p.href}?colour=${encodeURIComponent(colour.name)}` : p.href;
  const extra = p.colours.length - MAX_SWATCHES;
  // plain left-clicks morph the card image into the product page hero (View Transitions API)
  const open = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    navigateWithTransition(router, href, media.current);
  };

  return (
    <article className="group/card relative flex flex-col">
      <div ref={media} className="relative aspect-[3/4] overflow-hidden bg-muted">
        <Link
          href={href}
          onClick={open}
          className="absolute inset-0"
          aria-label={`${p.title}${colour ? `, ${colour.name}` : ""}`}
        >
          {colour?.image && (
            <Image
              src={colour.image}
              alt={colour.alt}
              fill
              sizes={sizes}
              priority={priority}
              className={cn(
                "object-cover transition-[opacity,transform] duration-700 ease-out group-hover/card:scale-[1.015] motion-reduce:transform-none",
                colour.altImage && "group-hover/card:opacity-0",
              )}
            />
          )}
          {colour?.altImage && (
            <Image
              src={colour.altImage}
              alt=""
              fill
              sizes={sizes}
              loading="lazy"
              className="object-cover opacity-0 transition-opacity duration-500 group-hover/card:opacity-100"
            />
          )}
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {p.soldOut ? (
            <span className="bg-background px-2 py-1 text-[0.6875rem] font-medium">Sold out</span>
          ) : p.isNew ? (
            <span className="bg-background px-2 py-1 text-[0.6875rem] font-medium">New</span>
          ) : null}
        </div>
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${p.title} from wishlist` : `Save ${p.title} to wishlist`}
          onClick={async () => {
            const added = await wishlist.toggle(p.id);
            if (added) {
              setPop(true);
              setTimeout(() => setPop(false), 450);
            }
            toast(added ? "Saved to wishlist" : "Removed from wishlist");
          }}
          className="absolute right-1 top-1 grid size-11 place-items-center text-foreground"
        >
          <span
            className={cn(
              "grid size-8 place-items-center rounded-full bg-background/80 backdrop-blur transition-transform active:scale-90",
              pop && "animate-pop",
            )}
          >
            <Heart className={cn("size-4", saved && "fill-foreground")} strokeWidth={1.5} />
          </span>
        </button>
        {!p.soldOut && (
          <>
            {/* touch: opens the size sheet. Mouse: hidden (sizes appear on hover) but still the keyboard route */}
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="quick-touch absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-background/90 text-foreground backdrop-blur transition-[opacity,transform] active:scale-90"
              aria-label={`Quick add ${p.title}`}
            >
              <Plus className="size-4" strokeWidth={1.5} />
            </button>
            <InlineSizes p={p} colourIdx={colourIdx} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-1 px-0.5 pb-2 pt-3">
        <h3 className="text-[0.8125rem] leading-snug md:text-[0.875rem]">
          <Link href={href} onClick={open} className="hover:underline hover:underline-offset-4">
            {p.title}
          </Link>
        </h3>
        <Price
          micros={p.priceUsdMicros}
          className="text-[0.8125rem] text-muted-foreground md:text-[0.875rem]"
        />
        {p.colours.length > 1 && (
          <div
            className="mt-1 flex items-center gap-1"
            role="radiogroup"
            aria-label={`Colours for ${p.title}`}
          >
            {p.colours.slice(0, MAX_SWATCHES).map((c, i) => (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={i === colourIdx}
                aria-label={`${c.name}${c.inStock ? "" : " (sold out)"}`}
                title={c.name}
                onClick={() => setColourIdx(i)}
                onMouseEnter={() => setColourIdx(i)}
                className="grid size-6 place-items-center"
              >
                <span
                  className={cn(
                    "block size-3.5 rounded-full ring-1 ring-foreground/15 ring-offset-2 ring-offset-background transition-shadow",
                    i === colourIdx && "ring-foreground",
                    !c.inStock && "opacity-40",
                  )}
                  style={{ background: c.hex ?? "var(--muted)" }}
                />
              </button>
            ))}
            {extra > 0 && (
              <Link
                href={p.href}
                className="ml-0.5 text-[0.75rem] text-muted-foreground"
                aria-label={`${extra} more colours`}
              >
                +{extra}
              </Link>
            )}
          </div>
        )}
      </div>
      <QuickAdd
        p={p}
        colourIdx={colourIdx}
        setColourIdx={setColourIdx}
        open={quickOpen}
        onOpenChange={setQuickOpen}
      />
    </article>
  );
}

/** Adds one unit and opens the bag drawer — shared by the hover sizes and the size sheet. */
function useQuickAdd(p: CardData, colourIdx: number) {
  const cart = useCart();
  const setBag = useUi((s) => s.setBag);
  const colour = p.colours[colourIdx];
  const [adding, setAdding] = useState<string | null>(null);
  async function add(variantId: string, size: string) {
    setAdding(variantId);
    try {
      await cart.add(variantId, 1);
      toast.success(
        `Added ${p.title}, ${colour?.name}${size === "One size" ? "" : `, size ${size}`}`,
      );
      setBag(true);
      return true;
    } catch {
      return false;
    } finally {
      setAdding(null);
    }
  }
  return { colour, adding, add };
}

/**
 * Mouse users: the sizes of the shown colour slide up over the image on hover; one click adds to the bag.
 * Hidden from assistive tech and the tab order — keyboard and screen-reader users use the "Quick add" button,
 * which opens the same choice in an accessible sheet.
 */
function InlineSizes({ p, colourIdx }: { p: CardData; colourIdx: number }) {
  const { colour, adding, add } = useQuickAdd(p, colourIdx);
  const sizes = p.sizes
    .map((s) => ({ size: s.size, v: s.variants.find((x) => x.colour === colour?.name) }))
    .filter((s) => !!s.v);
  if (!sizes.length) return null;
  const oneSize = sizes.length === 1 && sizes[0]!.size === "One size";
  return (
    <div
      aria-hidden="true"
      className="quick-inline absolute inset-x-2 bottom-2 z-10 bg-background/92 px-3 py-2.5 backdrop-blur"
    >
      <p className="mb-1.5 flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        <span>{oneSize ? "Quick add" : "Add size"}</span>
        <span className="truncate pl-2">{colour?.name}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {sizes.map(({ size, v }) => {
          const available = !!v && v.stock > 0;
          return (
            <button
              key={size}
              type="button"
              tabIndex={-1}
              disabled={!available || !!adding}
              onClick={() => v && add(v.variantId, size)}
              className={cn(
                "h-8 min-w-8 border border-transparent px-2 text-[0.75rem] tabular transition-[border-color,background-color,color] duration-200 hover:border-foreground",
                oneSize && "w-full border-border",
                !available &&
                  "cursor-not-allowed text-muted-foreground line-through hover:border-transparent",
                adding === v?.variantId && "animate-pulse bg-foreground text-background",
              )}
            >
              {oneSize ? "Add to bag" : size}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuickAdd({
  p,
  colourIdx,
  setColourIdx,
  open,
  onOpenChange,
}: {
  p: CardData;
  colourIdx: number;
  setColourIdx: (i: number) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const quick = useQuickAdd(p, colourIdx);
  const { colour, adding } = quick;
  async function add(variantId: string, size: string) {
    if (await quick.add(variantId, size)) onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        title={`Choose a size — ${p.title}`}
        className="md:inset-x-auto md:left-1/2 md:max-w-md md:-translate-x-1/2"
      >
        <div className="p-5">
          {p.colours.length > 1 && (
            <div className="mb-4">
              <p className="mb-2 text-[0.8125rem]">
                Colour: <span className="text-muted-foreground">{colour?.name}</span>
              </p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Colour">
                {p.colours.map((c, i) => (
                  <button
                    key={c.name}
                    type="button"
                    role="radio"
                    aria-checked={i === colourIdx}
                    aria-label={c.name}
                    onClick={() => setColourIdx(i)}
                    className="grid size-10 place-items-center"
                  >
                    <span
                      className={cn(
                        "block size-6 rounded-full ring-1 ring-foreground/15 ring-offset-2 ring-offset-card",
                        i === colourIdx && "ring-foreground",
                      )}
                      style={{ background: c.hex ?? "var(--muted)" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mb-2 text-[0.8125rem]">Size</p>
          <ul className="grid grid-cols-4 gap-2">
            {p.sizes.map((s) => {
              const v = s.variants.find((x) => x.colour === colour?.name);
              const available = !!v && v.stock > 0;
              return (
                <li key={s.size}>
                  <button
                    type="button"
                    disabled={!available || !!adding}
                    aria-disabled={!available}
                    aria-label={`Size ${s.size}${available ? "" : ", sold out"}`}
                    onClick={() => v && add(v.variantId, s.size)}
                    className={cn(
                      "h-11 w-full border border-border text-sm transition-colors hover:border-foreground",
                      !available &&
                        "cursor-not-allowed text-muted-foreground line-through hover:border-border",
                      adding === v?.variantId && "bg-foreground text-background",
                    )}
                  >
                    {s.size}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href={p.href}
            className="mt-5 inline-block text-[0.8125rem] underline underline-offset-4"
          >
            View full details
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
