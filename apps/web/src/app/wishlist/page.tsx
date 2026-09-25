"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { ProductCard, type CardData } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWishlist } from "@/hooks/use-wishlist";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { api } from "@/lib/api";

export default function WishlistPage() {
  const hydrated = useHydrated();
  const { user, loading } = useSession();
  const { ids } = useWishlist();
  const key = [...ids].sort().join(",");
  const q = useQuery({
    queryKey: ["wishlist-items", key],
    queryFn: async () => {
      if (!ids.length) return [] as CardData[];
      const res = await api<{ items: CardData[] }>(`/api/wishlist/cards?ids=${encodeURIComponent(ids.join(","))}`);
      return res.items;
    },
    enabled: hydrated && !loading,
  });
  return (
    <div className="container-page pt-8 md:pt-12">
      <h1 className="text-[2rem] tracking-[-0.03em] md:text-[2.5rem]">Wishlist</h1>
      {!user && hydrated && (
        <p className="mt-2 text-sm text-muted-foreground">
          Saved on this device.{" "}
          <Link href="/sign-in?next=/wishlist" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>{" "}
          to keep your wishlist across devices.
        </p>
      )}
      {!hydrated || q.isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-[2px] md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : !q.data || q.data.length === 0 ? (
        <div className="mt-8 border-y border-border py-20 text-center">
          <Heart className="mx-auto size-8 text-muted-foreground" strokeWidth={1.25} />
          <p className="mt-4 text-lg">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Tap the heart on any product to save it here.</p>
          <Link href="/new" className="mt-6 inline-block text-sm underline underline-offset-4">
            Browse new arrivals
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-[2px] gap-y-6 md:grid-cols-3 xl:grid-cols-4">
          {q.data.map((p) => (
            <li key={p.id}>
              <ProductCard p={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
