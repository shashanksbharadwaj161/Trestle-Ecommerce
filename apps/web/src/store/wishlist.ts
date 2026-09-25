"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Guest wishlist (product ids) kept in localStorage; merged into the account after sign-in. */
interface LocalWishlist {
  ids: string[];
  toggle: (id: string) => void;
  clear: () => void;
}

export const useLocalWishlist = create<LocalWishlist>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids].slice(0, 200) })),
      clear: () => set({ ids: [] }),
    }),
    { name: "trestle-wishlist" },
  ),
);
