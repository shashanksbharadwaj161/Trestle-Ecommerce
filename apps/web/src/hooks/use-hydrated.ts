"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false while React hydrates server HTML (and on the server), true for every other client render — including
 * components mounted after a client-side navigation, so they never flash a placeholder.
 *
 * Hydration is progressive: the header can hydrate, fetch the session/bag and fill the query cache before a
 * later Suspense boundary on the same page hydrates. Hooks whose output depends on client-only state (query
 * cache, localStorage) return their server-equivalent value until hydrated, so that boundary can never
 * mismatch the server HTML (React error #418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
