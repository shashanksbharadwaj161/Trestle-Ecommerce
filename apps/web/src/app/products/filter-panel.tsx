"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Filters are always visible on large screens and collapsible on phones so products stay above the fold. */
export function FilterPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button
        variant="outline"
        className="mb-3 w-full lg:hidden"
        aria-expanded={open}
        aria-controls="product-filters"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal /> {open ? "Hide filters" : "Show filters"}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>
      <div id="product-filters" className={cn(open ? "block" : "hidden", "lg:block")}>
        {children}
      </div>
    </div>
  );
}
