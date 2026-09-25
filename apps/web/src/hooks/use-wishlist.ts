"use client";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useLocalWishlist } from "@/store/wishlist";
import { useHydrated } from "./use-hydrated";
import { useSession } from "./use-session";

interface ServerWishlist {
  productIds: string[];
}

export function useWishlist() {
  const { user } = useSession();
  const local = useLocalWishlist();
  const qc = useQueryClient();
  const server = useQuery({
    queryKey: ["wishlist", user?.id],
    queryFn: () => api<ServerWishlist>("/api/account/wishlist"),
    enabled: !!user,
  });
  const m = useMutation({
    mutationFn: (body: { op: "add" | "remove"; productId: string }) =>
      api<ServerWishlist>("/api/account/wishlist", { body }),
    onSuccess: (d) => {
      qc.setQueryData(["wishlist", user?.id], d);
      qc.invalidateQueries({ queryKey: ["wishlist-items"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const hydrated = useHydrated();
  // the guest list lives in localStorage, which the server cannot see — empty while hydrating
  const ids = !hydrated ? [] : user ? (server.data?.productIds ?? []) : local.ids;
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: async (id: string) => {
      const adding = !ids.includes(id);
      if (user) await m.mutateAsync({ op: adding ? "add" : "remove", productId: id });
      else local.toggle(id);
      return adding;
    },
  };
}

/** After sign-in, move the guest wishlist into the account once. */
export function WishlistSync() {
  const { user } = useSession();
  const qc = useQueryClient();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!user || done.current === user.id) return;
    done.current = user.id;
    const ids = useLocalWishlist.getState().ids;
    if (!ids.length) return;
    api<ServerWishlist>("/api/account/wishlist", { body: { op: "merge", productIds: ids } })
      .then((d) => {
        useLocalWishlist.getState().clear();
        qc.setQueryData(["wishlist", user.id], d);
      })
      .catch(() => undefined);
  }, [user, qc]);
  return null;
}
