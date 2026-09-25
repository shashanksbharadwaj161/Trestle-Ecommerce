"use client";
import { create } from "zustand";

interface UiState {
  bagOpen: boolean;
  searchOpen: boolean;
  menuOpen: boolean;
  setBag: (v: boolean) => void;
  setSearch: (v: boolean) => void;
  setMenu: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  bagOpen: false,
  searchOpen: false,
  menuOpen: false,
  setBag: (bagOpen) => set({ bagOpen }),
  setSearch: (searchOpen) => set({ searchOpen }),
  setMenu: (menuOpen) => set({ menuOpen }),
}));
