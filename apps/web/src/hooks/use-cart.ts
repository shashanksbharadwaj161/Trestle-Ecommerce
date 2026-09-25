"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export interface HydratedLine {
  variantId: string;
  variantName: string;
  colour: string | null;
  size: string | null;
  image: string | null;
  sku: string;
  stock: number;
  quantity: number;
  lineTotalUsdMicros: string;
  product: {
    id: string;
    slug: string | null;
    title: string;
    images: string[];
    priceUsdMicros: string;
    department: string | null;
    chainListingOptions: number[];
    seller: {
      id: string;
      storefrontName: string;
      slug: string;
      verified: boolean;
      payoutChainId: number;
      payoutToken: string;
    };
  };
}
export interface HydratedCart {
  lines: HydratedLine[];
  groups: {
    seller: HydratedLine["product"]["seller"];
    lines: HydratedLine[];
    subtotalUsdMicros: string;
  }[];
  subtotalUsdMicros: string;
  warnings: string[];
}

type Mutation =
  | { op: "add"; variantId: string; quantity: number }
  | { op: "set"; variantId: string; quantity: number }
  | { op: "remove"; variantId: string }
  | { op: "clear" };

export const CART_KEY = ["cart"] as const;

/** Server-side bag for guests (cookie) and signed-in shoppers alike. */
export function useCart() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CART_KEY,
    queryFn: () => api<HydratedCart>("/api/cart"),
    staleTime: 15_000,
  });
  const mutation = useMutation({
    mutationFn: (m: Mutation) => api<HydratedCart>("/api/cart", { body: m }),
    onSuccess: (data) => qc.setQueryData(CART_KEY, data),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const count = (q.data?.lines ?? []).reduce((s, l) => s + l.quantity, 0);
  return {
    data: q.data,
    count,
    isLoading: q.isLoading,
    isError: q.isError,
    pending: mutation.isPending,
    add: (variantId: string, quantity = 1) => mutation.mutateAsync({ op: "add", variantId, quantity }),
    setQty: (variantId: string, quantity: number) =>
      mutation.mutateAsync({ op: "set", variantId, quantity }),
    remove: (variantId: string) => mutation.mutateAsync({ op: "remove", variantId }),
    clear: () => mutation.mutateAsync({ op: "clear" }),
    refetch: q.refetch,
  };
}
