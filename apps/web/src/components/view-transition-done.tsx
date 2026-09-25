"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { completeViewTransition } from "@/lib/view-transition";

/** Resolves a pending view transition after the new route commits (after paint). */
export function ViewTransitionDone() {
  const pathname = usePathname();
  useEffect(() => {
    const id = requestAnimationFrame(() => completeViewTransition());
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
