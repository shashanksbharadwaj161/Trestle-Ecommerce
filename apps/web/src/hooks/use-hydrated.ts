"use client";
import { useEffect, useState } from "react";

/**
 * false during SSR and the first client render, true afterwards. Components whose output depends on client-only
 * state (session/cart caches, localStorage) render their server-equivalent placeholder until hydrated, so late
 * hydrating Suspense boundaries can never mismatch the server HTML.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
