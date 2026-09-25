import Image from "next/image";
import Link from "next/link";
import { CATEGORY_LABEL, type Category, type Department } from "@trestle/shared";
import { productQuery } from "@/lib/schemas";
import { listCatalog } from "@/server/catalog";
import { toJsonSafe } from "@trestle/db";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ProductCard, type CardData } from "@/components/product-card";
import { ListingControls, type Facets } from "./listing-controls";
import { cn } from "@/lib/cn";

export type SearchParams = Record<string, string | string[] | undefined>;

export interface EditorialTile {
  href: string;
  image: string;
  title: string;
  kicker: string;
}

export interface ListingPreset {
  title: string;
  description?: string;
  breadcrumb: { label: string; href?: string }[];
  department?: Department;
  collection?: string;
  newOnly?: boolean;
  /** base path the filters link to */
  basePath: string;
  editorial?: EditorialTile[];
  /** category chips shown under the title */
  chips?: Category[];
}

const PAGE_SIZE = 24;

function flat(sp: SearchParams) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v !== undefined) out[k] = Array.isArray(v) ? v.join(",") : v;
  return out;
}

export async function ListingPage({ preset, searchParams }: { preset: ListingPreset; searchParams: SearchParams }) {
  const raw = flat(searchParams);
  const parsed = productQuery.safeParse({
    ...raw,
    department: preset.department ?? raw.department,
    collection: preset.collection ?? raw.collection,
    new: preset.newOnly ? "1" : raw.new,
  });
  const q = parsed.success ? parsed.data : productQuery.parse({ department: preset.department });
  const page = Math.min(q.page, 20);
  // "load more" re-renders page 1..n from the URL, so state survives reloads and sharing
  const data = await listCatalog({ ...q, page: 1, pageSize: PAGE_SIZE * page });
  const items = toJsonSafe(data.items) as unknown as CardData[];
  const facets = toJsonSafe(data.facets) as unknown as Facets;
  const filtered =
    !!q.category?.length || !!q.colour?.length || !!q.size?.length || !!q.minPrice || !!q.maxPrice || !!q.inStock || !!q.q;
  const showEditorial = !filtered && q.sort === "featured" && (preset.editorial?.length ?? 0) > 0;

  // interleave editorial tiles (COS-style) after every 8 products
  const cells: ({ kind: "p"; p: CardData; i: number } | { kind: "e"; e: EditorialTile })[] = [];
  let e = 0;
  items.forEach((p, i) => {
    cells.push({ kind: "p", p, i });
    if (showEditorial && (i + 1) % 8 === 6 && preset.editorial![e]) cells.push({ kind: "e", e: preset.editorial![e++]! });
  });

  const nextHref = (() => {
    const sp = new URLSearchParams(raw);
    sp.set("page", String(page + 1));
    return `${preset.basePath}?${sp.toString()}`;
  })();

  return (
    <div className="pb-8">
      <div className="container-page pt-6 md:pt-8">
        <Breadcrumb items={preset.breadcrumb} />
        <div className="mt-6 flex flex-col gap-2 md:mt-10">
          <h1 className="text-[2rem] leading-[1.05] tracking-[-0.03em] md:text-[2.75rem]">
            {q.q && !preset.department && !preset.collection ? <>Results for “{q.q}”</> : preset.title}
          </h1>
          {preset.description && <p className="max-w-xl text-sm text-muted-foreground">{preset.description}</p>}
        </div>
        {preset.chips && preset.chips.length > 0 && (
          <nav aria-label="Categories" className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            <Chip href={preset.basePath} active={!q.category?.length}>
              All
            </Chip>
            {preset.chips.map((c) => (
              <Chip key={c} href={`${preset.basePath}?category=${c}`} active={q.category?.length === 1 && q.category[0] === c}>
                {CATEGORY_LABEL[c]}
              </Chip>
            ))}
          </nav>
        )}
      </div>

      <ListingControls
        basePath={preset.basePath}
        facets={facets}
        total={data.total}
        query={{
          q: q.q ?? "",
          sort: q.sort,
          category: q.category ?? [],
          colour: q.colour ?? [],
          size: q.size ?? [],
          minPrice: q.minPrice ?? "",
          maxPrice: q.maxPrice ?? "",
          inStock: !!q.inStock,
        }}
      />

      {items.length === 0 ? (
        <div className="container-page">
          <div className="border-y border-border py-20 text-center">
            <p className="text-lg">No products match these filters.</p>
            <p className="mt-2 text-sm text-muted-foreground">Try removing a filter or searching for something else.</p>
            <Link href={preset.basePath} className="mt-6 inline-block text-sm underline underline-offset-4">
              Clear all filters
            </Link>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-[2px] gap-y-6 md:grid-cols-3 md:gap-y-8 xl:grid-cols-4" aria-label="Products">
          {cells.map((c, idx) =>
            c.kind === "p" ? (
              <li key={c.p.id} className="reveal">
                <ProductCard p={c.p} priority={c.i < 4} />
              </li>
            ) : (
              <li key={`e-${idx}`} className="reveal reveal-image col-span-2">
                <Link href={c.e.href} className="group relative block h-full min-h-[70vw] overflow-hidden bg-muted md:min-h-0">
                  <Image
                    src={c.e.image}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 50vw, (min-width: 768px) 66vw, 100vw"
                    className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-5 pt-24 text-white md:p-8">
                    <p className="eyebrow opacity-90">{c.e.kicker}</p>
                    <p className="mt-2 text-2xl tracking-tight md:text-3xl">{c.e.title}</p>
                    <span className="mt-3 inline-block text-sm underline underline-offset-4">Shop now</span>
                  </div>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}

      {items.length > 0 && (
        <div className="container-page mt-12 flex flex-col items-center gap-4">
          <p className="tabular text-[0.8125rem] text-muted-foreground" aria-live="polite">
            Showing {items.length} of {data.total}
          </p>
          <div className="h-[2px] w-40 bg-border" aria-hidden>
            <div className="h-full bg-foreground" style={{ width: `${Math.round((items.length / Math.max(1, data.total)) * 100)}%` }} />
          </div>
          {items.length < data.total && (
            <Link href={nextHref} scroll={false} className="mt-2 inline-flex h-11 items-center border border-foreground px-8 text-sm transition-colors hover:bg-foreground hover:text-background">
              Load more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[0.8125rem] transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
      )}
    >
      {children}
    </Link>
  );
}
