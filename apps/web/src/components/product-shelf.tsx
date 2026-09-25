"use client";
import { Carousel } from "@/components/ui/carousel";
import { ProductCard, type CardData } from "./product-card";

/** Apple-style horizontal shelf: swipe on touch, arrows on desktop. */
export function ProductShelf({ items, label }: { items: CardData[]; label: string }) {
  return (
    <Carousel
      label={label}
      className="pl-4 md:pl-6 xl:pl-10"
      slideClassName="basis-[46%] pr-[2px] sm:basis-[31%] md:basis-[26%] xl:basis-[21%]"
    >
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} priority={i < 2} sizes="(min-width: 1280px) 21vw, (min-width: 768px) 26vw, 46vw" />
      ))}
    </Carousel>
  );
}
