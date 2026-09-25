"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Recently viewed product ids (this device only). */
export const useRecent = create<{ ids: string[]; add: (id: string) => void }>()(
  persist(
    (set) => ({
      ids: [],
      add: (id) => set((s) => ({ ids: [id, ...s.ids.filter((x) => x !== id)].slice(0, 12) })),
    }),
    { name: "trestle-recent" },
  ),
);
