"use client";
import Image from "next/image";
import { useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";
import { Carousel } from "@/components/ui/carousel";
import { cn } from "@/lib/cn";

export interface GalleryImage {
  url: string;
  alt: string;
}

/**
 * Desktop: two-column image stack (COS/Toteme style). Mobile: swipeable carousel with indicators.
 * Any image opens a full-screen zoom viewer (pointer-driven pan when zoomed; Esc to close).
 */
export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  if (images.length === 0) {
    return (
      <div className="grid aspect-[3/4] place-items-center bg-muted text-sm text-muted-foreground">
        No photography yet
      </div>
    );
  }
  return (
    <>
      <div className="md:hidden">
        <Carousel label={`${title} images`} dots arrows={false}>
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setZoomAt(i)}
              className="relative block aspect-[3/4] w-full bg-muted"
              aria-label={`Zoom image ${i + 1}: ${img.alt}`}
            >
              <Image src={img.url} alt={img.alt} fill priority={i === 0} sizes="100vw" className="object-cover" />
            </button>
          ))}
        </Carousel>
      </div>
      <ul className="hidden grid-cols-2 gap-[2px] md:grid">
        {images.map((img, i) => (
          <li key={img.url} className={cn(wide(images.length, i) && "col-span-2")}>
            <button
              type="button"
              onClick={() => setZoomAt(i)}
              className="group relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden bg-muted"
              aria-label={`Zoom image ${i + 1}: ${img.alt}`}
            >
              <Image
                src={img.url}
                alt={img.alt}
                fill
                priority={i < 2}
                sizes={wide(images.length, i) ? "58vw" : "29vw"}
                className="object-cover"
              />
              <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-background/85 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <ZoomIn className="size-4" strokeWidth={1.5} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ZoomViewer images={images} index={zoomAt} onIndex={setZoomAt} title={title} />
    </>
  );
}

/** 1–2 images stack full width; odd counts lead with one wide image; the rest pair up. */
function wide(count: number, i: number) {
  return count <= 2 || (count % 2 === 1 && i === 0);
}

function ZoomViewer({
  images,
  index,
  onIndex,
  title,
}: {
  images: GalleryImage[];
  index: number | null;
  onIndex: (i: number | null) => void;
  title: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const img = index !== null ? images[index] : null;
  return (
    <D.Root
      open={index !== null}
      onOpenChange={(o) => {
        if (!o) {
          onIndex(null);
          setZoomed(false);
        }
      }}
    >
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-background animate-fade-in" />
        <D.Content
          className="fixed inset-0 z-50 flex flex-col outline-none animate-fade-in"
          onKeyDown={(e) => {
            if (index === null) return;
            if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
            if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
          }}
        >
          <D.Title className="sr-only">{title} — image viewer</D.Title>
          <D.Description className="sr-only">
            Click the image to zoom in; move the pointer to pan. Use the arrow keys to change image.
          </D.Description>
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <p className="tabular text-sm text-muted-foreground" aria-live="polite">
              {index !== null ? `${index + 1} / ${images.length}` : ""}
            </p>
            <D.Close className="grid size-11 place-items-center" aria-label="Close viewer">
              <X className="size-5" strokeWidth={1.5} />
            </D.Close>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {img && (
              <button
                type="button"
                aria-label={zoomed ? "Zoom out" : "Zoom in"}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
                  setZoomed((z) => !z);
                }}
                onPointerMove={(e) => {
                  if (!zoomed) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
                }}
                className={cn("relative block size-full", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
              >
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  sizes="100vw"
                  quality={90}
                  className="object-contain transition-transform duration-300 ease-out"
                  style={{ transform: zoomed ? "scale(2.2)" : "scale(1)", transformOrigin: origin }}
                />
              </button>
            )}
          </div>
          {images.length > 1 && (
            <div className="no-scrollbar flex shrink-0 justify-center gap-2 overflow-x-auto p-3">
              {images.map((im, i) => (
                <button
                  key={im.url}
                  type="button"
                  onClick={() => {
                    setZoomed(false);
                    onIndex(i);
                  }}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === index}
                  className={cn("relative h-16 w-12 shrink-0 overflow-hidden bg-muted ring-offset-2 ring-offset-background", i === index && "ring-1 ring-foreground")}
                >
                  <Image src={im.url} alt="" fill sizes="48px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
