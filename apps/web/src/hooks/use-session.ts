"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHydrated } from "./use-hydrated";

export interface SessionUser {
  id: string;
  walletAddress: string | null;
  email: string | null;
  role: "BUYER" | "SELLER" | "ADMIN";
  displayName: string | null;
  sellerId: string | null;
  hasPassword: boolean;
}

export function useSession() {
  const q = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: SessionUser | null }>("/api/auth/session"),
    staleTime: 30_000,
  });
  // the server always renders the signed-out loading state; so does a hydrating boundary (see useHydrated)
  const hydrated = useHydrated();
  if (!hydrated) return { user: null, loading: true, refetch: q.refetch };
  return { user: q.data?.user ?? null, loading: q.isLoading, refetch: q.refetch };
}
