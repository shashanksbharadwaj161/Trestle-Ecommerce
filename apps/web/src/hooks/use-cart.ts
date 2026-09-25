"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useLocalCart } from "@/store/local-cart";
import { useSession } from "./use-session";

export interface HydratedLine {
  variantId: string;
  variantName: string;
  sku: string;
  stock: number;
  quantity: number;
  lineTotalUsdMicros: string;
  product: {
    id: string;
    title: string;
    images: string[];
    priceUsdMicros: string;
    chainListingOptions: number[];
    seller: {
      id: string;
      storefrontName: string;
      slug: string;
      verified: boolean;
      payoutChainId: number;
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

export function useCart() {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const local = useLocalCart();
  const authed = !!user;

  const server = useQuery({
    queryKey: ["cart", user?.id],
    queryFn: () => api<HydratedCart>("/api/cart"),
    enabled: authed,
  });
  const preview = useQuery({
    queryKey: ["cart-preview", local.lines],
    queryFn: () => api<HydratedCart>("/api/cart/preview", { body: { items: local.lines } }),
    enabled: !authed && !loading && local.lines.length > 0,
  });

  const mutation = useMutation({
    mutationFn: (m: Mutation) => api<HydratedCart>("/api/cart", { body: m }),
    onSuccess: (data) => qc.setQueryData(["cart", user?.id], data),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const data: HydratedCart | undefined = authed
    ? server.data
    : local.lines.length === 0
      ? { lines: [], groups: [], subtotalUsdMicros: "0", warnings: [] }
      : preview.data;
  const count = authed
    ? (server.data?.lines ?? []).reduce((s, l) => s + l.quantity, 0)
    : local.lines.reduce((s, l) => s + l.quantity, 0);

  async function run(m: Mutation) {
    if (authed) return mutation.mutateAsync(m);
    if (m.op === "add") local.add(m.variantId, m.quantity);
    else if (m.op === "set") local.set(m.variantId, m.quantity);
    else if (m.op === "remove") local.remove(m.variantId);
    else local.clear();
  }

  return {
    data,
    count,
    authed,
    isLoading: authed ? server.isLoading : preview.isLoading && local.lines.length > 0,
    isError: authed ? server.isError : preview.isError,
    pending: mutation.isPending,
    add: (variantId: string, quantity = 1) => run({ op: "add", variantId, quantity }),
    setQty: (variantId: string, quantity: number) => run({ op: "set", variantId, quantity }),
    remove: (variantId: string) => run({ op: "remove", variantId }),
    clear: () => run({ op: "clear" }),
    refetch: () => (authed ? server.refetch() : preview.refetch()),
  };
}
