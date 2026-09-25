"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SessionUser {
  id: string;
  walletAddress: string;
  role: "BUYER" | "SELLER" | "ADMIN";
  displayName: string | null;
  sellerId: string | null;
}

export function useSession() {
  const q = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: SessionUser | null }>("/api/auth/session"),
    staleTime: 30_000,
  });
  return { user: q.data?.user ?? null, loading: q.isLoading, refetch: q.refetch };
}
