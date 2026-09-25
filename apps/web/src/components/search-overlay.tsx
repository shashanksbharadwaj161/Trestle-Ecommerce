"use client";
import Image from "next/image";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Search, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { Price } from "./price";
import type { CardData } from "./product-card";
import { signalNavigation } from "@/components/navigation-progress";

const SUGGESTIONS = [
  { label: "Maxi dresses", q: "maxi" },
  { label: "Wide-leg jeans", q: "wide-leg" },
  { label: "White tees", q: "white tee" },
  { label: "Denim shorts", q: "shorts" },
  { label: "Beanies", q: "beanie" },
];

const RECENT_KEY = "trestle:recent-searches";
const MAX_RECENT = 6;

/** Recent searches live only in this browser (never sent anywhere). */
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* storage unavailable (private mode) — recent searches are a nicety */
  }
}

/** Wraps case-insensitive occurrences of the query in <mark>. */
function Highlight({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (t.length < 2) return <>{text}</>;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${esc})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === t.toLowerCase() ? (
          <mark
            key={i}
            className="bg-transparent font-medium text-foreground underline decoration-1 underline-offset-2"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchOverlay() {
  const { searchOpen, setSearch } = useUi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // the overlay only opens after hydration, so reading localStorage here cannot cause a mismatch
  useEffect(() => {
    if (searchOpen) setRecent(readRecent());
  }, [searchOpen]);
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
    // keep showing the previous results while the next keystroke loads — no skeleton flash
    placeholderData: keepPreviousData,
  });
  const fresh = useQuery({
    queryKey: ["search-new-in"],
    queryFn: () => api<{ items: CardData[] }>(`/api/products?sort=newest&pageSize=6`),
    enabled: searchOpen,
    staleTime: 5 * 60_000,
  });

  function submit(term = q) {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...readRecent().filter((r) => r.toLowerCase() !== t.toLowerCase())];
    writeRecent(next);
    setRecent(next);
    setQ("");
    setDebounced("");
    setSearch(false);
    signalNavigation();
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
            className="flex items-center gap-3 border-b border-foreground pb-3 pr-12 shadow-[inset_0_-1px_0_transparent] transition-shadow focus-within:shadow-[inset_0_-1px_0_var(--foreground)]"
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
              className="search-input h-12 w-full bg-transparent text-xl outline-none placeholder:text-muted-foreground focus-visible:outline-none md:text-2xl"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  input.current?.focus();
                }}
                className="grid size-10 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            )}
          </form>

          {debounced.length < 2 ? (
            <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="space-y-8">
                {recent.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="eyebrow text-muted-foreground">Recent searches</p>
                      <button
                        type="button"
                        onClick={() => {
                          writeRecent([]);
                          setRecent([]);
                        }}
                        className="text-[0.75rem] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Clear
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {recent.map((r) => (
                        <li key={r} className="group flex items-center">
                          <button
                            type="button"
                            onClick={() => submit(r)}
                            className="flex min-h-10 flex-1 items-center gap-3 text-left text-[0.9375rem] hover:underline hover:underline-offset-4"
                          >
                            <Clock
                              className="size-4 text-muted-foreground"
                              strokeWidth={1.5}
                              aria-hidden
                            />
                            {r}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove “${r}” from recent searches`}
                            onClick={() => {
                              const next = recent.filter((x) => x !== r);
                              writeRecent(next);
                              setRecent(next);
                            }}
                            className="grid size-10 place-items-center text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3.5" strokeWidth={1.5} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
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
              </div>
              {fresh.data && fresh.data.items.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="eyebrow text-muted-foreground">New in</p>
                    <Link
                      href="/new"
                      onClick={() => setSearch(false)}
                      className="link-draw-on text-sm"
                    >
                      View all
                    </Link>
                  </div>
                  <ResultGrid items={fresh.data.items} term="" onPick={() => setSearch(false)} />
                </div>
              )}
            </div>
          ) : results.isLoading ? (
            <div className="mt-8 grid grid-cols-3 gap-3 md:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4]" />
              ))}
            </div>
          ) : results.isError ? (
            <p className="mt-8 text-sm text-danger">
              Search is unavailable right now. Please try again.
            </p>
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
                <button
                  type="button"
                  onClick={() => submit(debounced)}
                  className="flex items-center gap-1 text-sm underline underline-offset-4"
                >
                  See all <ArrowRight className="size-3.5" />
                </button>
              </div>
              <div
                className={
                  results.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"
                }
              >
                <ResultGrid
                  items={results.data.items}
                  term={debounced}
                  onPick={() => setSearch(false)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResultGrid({
  items,
  term,
  onPick,
}: {
  items: CardData[];
  term: string;
  onPick: () => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-3 md:grid-cols-6">
      {items.map((p, i) => (
        <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
          <Link href={p.href} onClick={onPick} className="group block">
            <div className="relative aspect-[3/4] overflow-hidden bg-muted">
              {p.colours[0]?.image && (
                <Image
                  src={p.colours[0].image}
                  alt={p.colours[0].alt}
                  fill
                  sizes="(min-width: 768px) 16vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
              )}
            </div>
            <p className="mt-2 line-clamp-1 text-[0.8125rem] text-muted-foreground group-hover:text-foreground">
              <Highlight text={p.title} term={term} />
            </p>
            <Price micros={p.priceUsdMicros} className="text-[0.8125rem] text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
