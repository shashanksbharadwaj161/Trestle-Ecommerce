"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LocalCartLine {
  variantId: string;
  quantity: number;
}

/** Anonymous (signed-out) cart kept in the browser; merged into the Redis cart on sign-in. */
export const useLocalCart = create<{
  lines: LocalCartLine[];
  add: (variantId: string, quantity: number) => void;
  set: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}>()(
  persist(
    (set) => ({
      lines: [],
      add: (variantId, quantity) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === variantId);
          return {
            lines: existing
              ? s.lines.map((l) =>
                  l.variantId === variantId
                    ? { ...l, quantity: Math.min(20, l.quantity + quantity) }
                    : l,
                )
              : [...s.lines, { variantId, quantity: Math.min(20, quantity) }],
          };
        }),
      set: (variantId, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.variantId !== variantId)
              : s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
        })),
      remove: (variantId) =>
        set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: "trestle-cart", version: 1 },
  ),
);
