"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const list = images.length ? images : ["/art/placeholder?category=Collectibles"];
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={list[active]}
          alt={`${title} — image ${active + 1} of ${list.length}`}
          className="size-full object-cover"
        />
      </div>
      {list.length > 1 && (
        <div className="mt-3 flex gap-2" role="group" aria-label="Choose image">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              aria-label={`Show image ${i + 1}`}
              className={cn(
                "size-20 overflow-hidden rounded-lg border-2",
                i === active ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
