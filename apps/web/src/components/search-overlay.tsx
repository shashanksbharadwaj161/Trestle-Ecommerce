"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { Price } from "./price";
import type { CardData } from "./product-card";

const SUGGESTIONS = [
  { label: "Maxi dresses", q: "maxi" },
  { label: "Wide-leg jeans", q: "wide-leg" },
  { label: "White tees", q: "white tee" },
  { label: "Denim shorts", q: "shorts" },
  { label: "Beanies", q: "beanie" },
];

export function SearchOverlay() {
  const { searchOpen, setSearch } = useUi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () =>
      api<{ items: CardData[]; total: number }>(
        `/api/products?q=${encodeURIComponent(debounced)}&pageSize=6`,
      ),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  function submit(term = q) {
    const t = term.trim();
    if (!t) return;
    setSearch(false);
    router.push(`/search?q=${encodeURIComponent(t)}`);
  }

  return (
    <Sheet open={searchOpen} onOpenChange={setSearch}>
      <SheetContent
        side="top"
        title="Search"
        hideTitle
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        className="max-h-[92dvh]"
      >
        <div className="container-page pb-10 pt-4">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-center gap-3 border-b border-foreground pb-3 pr-12"
          >
            <Search className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <input
              ref={input}
              id="site-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search dresses, denim, tees…"
              autoComplete="off"
              className="h-12 w-full bg-transparent text-xl outline-none placeholder:text-muted-foreground md:text-2xl"
            />
          </form>

          {debounced.length < 2 ? (
            <div className="mt-8">
              <p className="eyebrow mb-3 text-muted-foreground">Popular searches</p>
              <ul className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s.q}>
                    <button
                      type="button"
                      onClick={() => submit(s.q)}
                      className="h-10 rounded-full border border-border px-4 text-sm transition-colors hover:border-foreground"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : results.isLoading ? (
            <div className="mt-8 grid grid-cols-3 gap-3 md:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4]" />
              ))}
            </div>
          ) : results.isError ? (
            <p className="mt-8 text-sm text-danger">Search is unavailable right now. Please try again.</p>
          ) : results.data && results.data.items.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">
              No results for “{debounced}”. Try a different word, such as “dress” or “denim”.
            </p>
          ) : results.data ? (
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="eyebrow text-muted-foreground">
                  {results.data.total} result{results.data.total === 1 ? "" : "s"}
                </p>
                <button type="button" onClick={() => submit(debounced)} className="flex items-center gap-1 text-sm underline underline-offset-4">
                  See all <ArrowRight className="size-3.5" />
                </button>
              </div>
              <ul className="grid grid-cols-3 gap-3 md:grid-cols-6">
                {results.data.items.map((p) => (
                  <li key={p.id}>
                    <Link href={p.href} onClick={() => setSearch(false)} className="group block">
                      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                        {p.colours[0]?.image && (
                          <Image src={p.colours[0].image} alt={p.colours[0].alt} fill sizes="200px" className="object-cover" />
                        )}
                      </div>
                      <p className="mt-2 line-clamp-1 text-[0.8125rem] group-hover:underline">{p.title}</p>
                      <Price micros={p.priceUsdMicros} className="text-[0.8125rem] text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
