"use client";
import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Minimal shadcn-style carousel on Embla: swipe, keyboard arrows, prev/next and dot indicators. */
export function Carousel({
  children,
  label,
  className,
  slideClassName,
  dots = false,
  arrows = true,
  onIndexChange,
  startIndex = 0,
}: {
  children: React.ReactNode[];
  label: string;
  className?: string;
  slideClassName?: string;
  dots?: boolean;
  arrows?: boolean;
  onIndexChange?: (i: number) => void;
  startIndex?: number;
}) {
  const [ref, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", startIndex });
  const [index, setIndex] = React.useState(startIndex);
  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);
  React.useEffect(() => {
    if (!api) return;
    const update = () => {
      setIndex(api.selectedScrollSnap());
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
      onIndexChange?.(api.selectedScrollSnap());
    };
    update();
    api.on("select", update).on("reInit", update);
    return () => {
      api.off("select", update).off("reInit", update);
    };
  }, [api, onIndexChange]);
  React.useEffect(() => {
    if (api && api.selectedScrollSnap() !== startIndex) api.scrollTo(startIndex);
  }, [api, startIndex]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={cn("relative", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") api?.scrollPrev();
        if (e.key === "ArrowRight") api?.scrollNext();
      }}
    >
      <div ref={ref} className="overflow-hidden">
        <div className="flex touch-pan-y">
          {children.map((c, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${children.length}`}
              className={cn("min-w-0 shrink-0 grow-0 basis-full", slideClassName)}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
      {arrows && children.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => api?.scrollPrev()}
            disabled={!canPrev}
            className="absolute left-2 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-card transition-opacity disabled:opacity-0 md:grid"
          >
            <ChevronLeft className="size-5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => api?.scrollNext()}
            disabled={!canNext}
            className="absolute right-2 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-card transition-opacity disabled:opacity-0 md:grid"
          >
            <ChevronRight className="size-5" strokeWidth={1.5} />
          </button>
        </>
      )}
      {dots && children.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label={`${label} slides`}>
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className="grid size-6 place-items-center"
            >
              <span
                className={cn(
                  "block h-[3px] rounded-full transition-all duration-200",
                  i === index ? "w-5 bg-foreground" : "w-2 bg-foreground/25",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
