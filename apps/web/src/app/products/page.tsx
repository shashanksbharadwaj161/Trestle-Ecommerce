import Link from "next/link";
import type { Metadata } from "next";
import { PRODUCT_CATEGORIES } from "@trestle/shared";
import { productQuery } from "@/lib/schemas";
import { listProducts } from "@/server/products";
import { chainProfiles } from "@/server/chain";
import { ProductCard, toCardData } from "@/components/product-card";
import { Container, EmptyState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { FilterPanel } from "./filter-panel";

export const metadata: Metadata = { title: "Shop" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = productQuery.safeParse(flat);
  const q = parsed.success ? parsed.data : productQuery.parse({});
  const result = await listProducts(q);
  const chains = chainProfiles();
  const qs = (page: number) => {
    const p = new URLSearchParams(flat as Record<string, string>);
    p.set("page", String(page));
    return `/products?${p.toString()}`;
  };

  return (
    <Container>
      <PageHeader
        title={q.q ? `Results for “${q.q}”` : (q.category ?? "All products")}
        description={`${result.total} item${result.total === 1 ? "" : "s"} · every order is escrow-protected`}
      />
      {!parsed.success && (
        <p className="mb-4 text-sm text-danger">Some filters were invalid and have been ignored.</p>
      )}
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside aria-label="Filters">
          <FilterPanel
            activeCount={
              ["q", "category", "minPrice", "maxPrice", "chain"].filter((k) => flat[k]).length
            }
          >
            <form
              method="get"
              action="/products"
              className="space-y-5 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20"
            >
              <div className="space-y-1.5">
                <Label htmlFor="f-q">Search</Label>
                <Input id="f-q" name="q" defaultValue={q.q ?? ""} placeholder="Title, brand…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-category">Category</Label>
                <Select id="f-category" name="category" defaultValue={q.category ?? ""}>
                  <option value="">All categories</option>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Price (USD)</legend>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Minimum price"
                    name="minPrice"
                    inputMode="decimal"
                    defaultValue={q.minPrice ?? ""}
                    placeholder="Min"
                  />
                  <span className="text-muted-foreground" aria-hidden>
                    –
                  </span>
                  <Input
                    aria-label="Maximum price"
                    name="maxPrice"
                    inputMode="decimal"
                    defaultValue={q.maxPrice ?? ""}
                    placeholder="Max"
                  />
                </div>
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="f-chain">Payable from</Label>
                <Select id="f-chain" name="chain" defaultValue={q.chain ? String(q.chain) : ""}>
                  <option value="">Any supported chain</option>
                  {chains.map((c) => (
                    <option key={c.chain.id} value={c.chain.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-sort">Sort by</Label>
                <Select id="f-sort" name="sort" defaultValue={q.sort}>
                  <option value="featured">Featured</option>
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="rating">Most reviewed</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  Apply
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/products">Reset</Link>
                </Button>
              </div>
            </form>
          </FilterPanel>
        </aside>
        <section aria-label="Products">
          {result.items.length === 0 ? (
            <EmptyState
              title="No products match these filters"
              description="Try widening the price range or clearing the search."
              action={{ href: "/products", label: "Clear filters" }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {result.items.map((p, i) => (
                  <ProductCard key={p.id} p={toCardData(p)} priority={i < 3} />
                ))}
              </div>
              {result.pageCount > 1 && (
                <nav
                  aria-label="Pagination"
                  className="mt-8 flex items-center justify-center gap-2"
                >
                  <Button variant="outline" size="sm" asChild disabled={q.page <= 1}>
                    <Link href={qs(Math.max(1, q.page - 1))} aria-disabled={q.page <= 1}>
                      Previous
                    </Link>
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {q.page} of {result.pageCount}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={qs(Math.min(result.pageCount, q.page + 1))}
                      aria-disabled={q.page >= result.pageCount}
                    >
                      Next
                    </Link>
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </Container>
  );
}
