"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHydrated } from "@/hooks/use-hydrated";
import { useRecent } from "@/store/recent";
import { ProductShelf } from "./product-shelf";
import type { CardData } from "./product-card";

/** Records a view (when `track` is set) and shows the other recently viewed products. */
export function RecentlyViewed({ track, exclude }: { track?: string; exclude?: string }) {
  const hydrated = useHydrated();
  const { ids, add } = useRecent();
  useEffect(() => {
    if (track) add(track);
  }, [track, add]);
  const list = ids.filter((id) => id !== exclude).slice(0, 10);
  const key = list.join(",");
  const q = useQuery({
    queryKey: ["recent-cards", key],
    queryFn: () => api<{ items: CardData[] }>(`/api/wishlist/cards?ids=${encodeURIComponent(key)}`),
    enabled: hydrated && list.length > 0,
    staleTime: 60_000,
  });
  if (!hydrated || !q.data || q.data.items.length === 0) return null;
  return (
    <section aria-labelledby="recent-title" className="reveal mt-20 md:mt-28">
      <h2 id="recent-title" className="container-page mb-6 text-xl">
        Recently viewed
      </h2>
      <ProductShelf items={q.data.items} label="Recently viewed" />
    </section>
  );
}
