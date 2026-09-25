"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { DENSITY_COOKIE, type Density } from "@/lib/grid-density";

/** Two small glyphs: more, smaller images vs fewer, larger images. */
function Glyph({ cols }: { cols: 2 | 4 }) {
  const cells = cols === 4 ? [0, 1, 2, 3] : [0, 1];
  const w = cols === 4 ? 3 : 7;
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden>
      {cells.map((i) => (
        <rect key={i} x={i * (w + 1.33)} y="0" width={w} height="12" fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Switches the product grid between the standard density and larger images. The choice is kept in a
 * first-party cookie so the server renders the same layout next time (no shift on load). Where supported,
 * the cards glide to their new positions with a View Transition.
 */
export function GridDensity({ initial }: { initial: Density }) {
  const router = useRouter();
  const [density, setDensity] = useState<Density>(initial);

  function apply(next: Density) {
    if (next === density) return;
    setDensity(next);
    document.cookie = `${DENSITY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const grid = document.querySelector<HTMLElement>("[data-product-grid]");
    if (!grid) return;
    const swap = () => {
      grid.dataset.density = next;
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    if (!doc.startViewTransition || reduce) {
      swap();
      router.refresh();
      return;
    }
    // name only the cards on screen so the morph stays cheap on long grids
    const named: HTMLElement[] = [];
    const vh = window.innerHeight;
    grid.querySelectorAll<HTMLElement>(":scope > li").forEach((li, i) => {
      const r = li.getBoundingClientRect();
      if (r.bottom > -200 && r.top < vh + 200) {
        li.style.viewTransitionName = `grid-cell-${i}`;
        named.push(li);
      }
    });
    const t = doc.startViewTransition(swap);
    t.finished.finally(() => {
      named.forEach((li) => (li.style.viewTransitionName = ""));
      router.refresh(); // re-render so image `sizes` match the new layout
    });
  }

  return (
    <div role="radiogroup" aria-label="Grid size" className="-mr-1 flex items-center">
      {(
        [
          ["standard", "Smaller images", 4],
          ["large", "Larger images", 2],
        ] as const
      ).map(([value, label, cols]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={density === value}
          aria-label={label}
          title={label}
          onClick={() => apply(value)}
          className={cn(
            "grid size-10 place-items-center text-muted-foreground transition-colors hover:text-foreground",
            density === value && "text-foreground",
          )}
        >
          <Glyph cols={cols} />
        </button>
      ))}
    </div>
  );
}
