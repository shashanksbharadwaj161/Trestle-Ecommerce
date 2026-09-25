"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { CATEGORY_LABEL, type Category } from "@trestle/shared";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { GridDensity } from "./grid-density";
import type { Density } from "@/lib/grid-density";
import { signalNavigation } from "@/components/navigation-progress";

export interface Facets {
  categories: { value: string; count: number }[];
  colours: { value: string; hex: string | null; count: number }[];
  sizes: string[];
  price: { min: string; max: string };
}

export interface ListingQuery {
  q: string;
  sort: string;
  category: string[];
  colour: string[];
  size: string[];
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
}

export const SORTS = [
  { value: "featured", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
];

const PRICE_BANDS = [
  { label: "Under $50", min: "", max: "49.99" },
  { label: "$50 – $100", min: "50", max: "100" },
  { label: "$100 – $150", min: "100", max: "150" },
  { label: "Over $150", min: "150", max: "" },
];

function toUrl(basePath: string, q: ListingQuery) {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.sort && q.sort !== "featured") sp.set("sort", q.sort);
  if (q.category.length) sp.set("category", q.category.join(","));
  if (q.colour.length) sp.set("colour", q.colour.join(","));
  if (q.size.length) sp.set("size", q.size.join(","));
  if (q.minPrice) sp.set("minPrice", q.minPrice);
  if (q.maxPrice) sp.set("maxPrice", q.maxPrice);
  if (q.inStock) sp.set("inStock", "1");
  const s = sp.toString();
  return s ? `${basePath}?${s}` : basePath;
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export function ListingControls({
  basePath,
  facets,
  total,
  query,
  density,
}: {
  basePath: string;
  facets: Facets;
  total: number;
  query: ListingQuery;
  density: Density;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(query);
  const [pending, setPending] = useState(false);
  const key = JSON.stringify(query);
  useEffect(() => {
    setDraft(JSON.parse(key) as ListingQuery);
    setPending(false);
    setOpen(false); // close the sheet once the new results have arrived
  }, [key]);

  const go = (q: ListingQuery) => {
    const url = toUrl(basePath, q);
    if (url === toUrl(basePath, query)) return;
    setPending(true);
    signalNavigation();
    router.push(url, { scroll: false });
  };
  const activeCount =
    query.category.length +
    query.colour.length +
    query.size.length +
    (query.minPrice || query.maxPrice ? 1 : 0) +
    (query.inStock ? 1 : 0);

  const chips: { label: string; remove: ListingQuery }[] = [
    ...query.category.map((c) => ({
      label: CATEGORY_LABEL[c as Category] ?? c,
      remove: { ...query, category: query.category.filter((x) => x !== c) },
    })),
    ...query.colour.map((c) => ({
      label: c,
      remove: { ...query, colour: query.colour.filter((x) => x !== c) },
    })),
    ...query.size.map((s) => ({
      label: `Size ${s}`,
      remove: { ...query, size: query.size.filter((x) => x !== s) },
    })),
    ...(query.minPrice || query.maxPrice
      ? [
          {
            label: priceLabel(query.minPrice, query.maxPrice),
            remove: { ...query, minPrice: "", maxPrice: "" },
          },
        ]
      : []),
    ...(query.inStock ? [{ label: "In stock", remove: { ...query, inStock: false } }] : []),
  ];

  return (
    <div className="sticky-under-header sticky top-[var(--header-offset)] z-30 mt-6 border-y border-border bg-background/95 backdrop-blur">
      <div className="container-page flex min-h-13 items-center justify-between gap-4 py-2">
        <p className="tabular text-[0.8125rem] text-muted-foreground" aria-live="polite">
          {pending ? "Updating…" : `${total} product${total === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-3">
          <GridDensity initial={density} />
          <div className="hidden md:block">
            <SelectMenu
              label="Sort by"
              value={query.sort}
              onValueChange={(v) => go({ ...query, sort: v })}
              options={SORTS}
              className="h-10 min-w-48 border-transparent bg-transparent hover:border-border"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-2 px-4"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal className="size-4" strokeWidth={1.5} />
            Filter &amp; sort
            {activeCount > 0 && (
              <span className="tabular grid min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] text-background">
                {activeCount}
              </span>
            )}
          </Button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="container-page no-scrollbar flex gap-2 overflow-x-auto pb-3">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => go(c.remove)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 text-[0.8125rem] hover:bg-border"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} <X className="size-3.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              go({
                ...query,
                category: [],
                colour: [],
                size: [],
                minPrice: "",
                maxPrice: "",
                inStock: false,
              })
            }
            className="h-8 shrink-0 px-2 text-[0.8125rem] underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          title="Filter & sort"
          footer={
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  setDraft({
                    ...draft,
                    category: [],
                    colour: [],
                    size: [],
                    minPrice: "",
                    maxPrice: "",
                    inStock: false,
                  })
                }
              >
                Clear
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (toUrl(basePath, draft) === toUrl(basePath, query)) setOpen(false);
                  else go(draft);
                }}
                loading={pending}
              >
                Show results
              </Button>
            </div>
          }
        >
          <div className="divide-y divide-border px-5">
            <fieldset className="py-5">
              <legend className="mb-3 text-[0.875rem] font-medium">Sort by</legend>
              <div className="space-y-1">
                {SORTS.map((s) => (
                  <label
                    key={s.value}
                    className="flex h-10 cursor-pointer items-center gap-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="sort"
                      value={s.value}
                      checked={draft.sort === s.value}
                      onChange={() => setDraft({ ...draft, sort: s.value })}
                      className="size-4 accent-[var(--foreground)]"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {facets.categories.length > 1 && (
              <fieldset className="py-5">
                <legend className="mb-3 text-[0.875rem] font-medium">Category</legend>
                <div className="space-y-1">
                  {facets.categories.map((c) => (
                    <label
                      key={c.value}
                      className="flex h-10 cursor-pointer items-center gap-3 text-sm"
                    >
                      <Checkbox
                        checked={draft.category.includes(c.value)}
                        onCheckedChange={() =>
                          setDraft({ ...draft, category: toggle(draft.category, c.value) })
                        }
                      />
                      <span className="flex-1">
                        {CATEGORY_LABEL[c.value as Category] ?? c.value}
                      </span>
                      <span className="tabular text-xs text-muted-foreground">{c.count}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {facets.colours.length > 0 && (
              <fieldset className="py-5">
                <legend className="mb-3 text-[0.875rem] font-medium">Colour</legend>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {facets.colours.map((c) => {
                    const on = draft.colour.includes(c.value);
                    return (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraft({ ...draft, colour: toggle(draft.colour, c.value) })
                        }
                        className={cn(
                          "flex h-10 items-center gap-2.5 text-left text-sm",
                          on && "font-medium",
                        )}
                      >
                        <span
                          className={cn(
                            "size-5 shrink-0 rounded-full ring-1 ring-foreground/15 ring-offset-2 ring-offset-card",
                            on && "ring-foreground",
                          )}
                          style={{ background: c.hex ?? "var(--muted)" }}
                          aria-hidden
                        />
                        <span className="truncate">{c.value}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {facets.sizes.length > 1 && (
              <fieldset className="py-5">
                <legend className="mb-1 text-[0.875rem] font-medium">Size</legend>
                <p className="mb-3 text-xs text-muted-foreground">
                  Shows products in stock in the sizes you choose.
                </p>
                <div className="flex flex-wrap gap-2">
                  {facets.sizes.map((s) => {
                    const on = draft.size.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDraft({ ...draft, size: toggle(draft.size, s) })}
                        className={cn(
                          "h-10 min-w-12 rounded-full border px-3 text-sm transition-colors",
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset className="py-5">
              <legend className="mb-3 text-[0.875rem] font-medium">Price</legend>
              <div className="flex flex-wrap gap-2">
                {PRICE_BANDS.map((b) => {
                  const on = draft.minPrice === b.min && draft.maxPrice === b.max;
                  return (
                    <button
                      key={b.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft(
                          on
                            ? { ...draft, minPrice: "", maxPrice: "" }
                            : { ...draft, minPrice: b.min, maxPrice: b.max },
                        )
                      }
                      className={cn(
                        "h-10 rounded-full border px-4 text-sm transition-colors",
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground",
                      )}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
              {BigInt(facets.price.max) > 0n && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Prices here range from {usd(facets.price.min, { cents: false })} to{" "}
                  {usd(facets.price.max, { cents: false })}.
                </p>
              )}
            </fieldset>

            <div className="py-5">
              <label className="flex h-10 cursor-pointer items-center gap-3 text-sm">
                <Checkbox
                  checked={draft.inStock}
                  onCheckedChange={(v) => setDraft({ ...draft, inStock: v === true })}
                />
                In stock only
              </label>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function priceLabel(min: string, max: string) {
  if (min && max) return `$${min} – $${max}`;
  if (min) return `Over $${min}`;
  return `Under $${Math.ceil(Number(max))}`;
}
