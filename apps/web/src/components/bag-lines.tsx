"use client";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import type { HydratedLine } from "@/hooks/use-cart";
import { Price } from "./price";

export function BagLine({
  line,
  onQty,
  onRemove,
  pending,
  compact,
  onNavigate,
}: {
  line: HydratedLine;
  onQty: (q: number) => void;
  onRemove: () => void;
  pending?: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const href = `/products/${line.product.slug ?? line.product.id}`;
  const max = Math.min(20, line.stock);
  return (
    <li className="flex gap-4 py-5">
      <Link href={href} onClick={onNavigate} className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden bg-muted sm:w-28">
        {line.image && (
          <Image src={line.image} alt={`${line.product.title} in ${line.colour ?? ""}`} fill sizes="112px" className="object-cover" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <Link href={href} onClick={onNavigate} className="text-[0.9375rem] leading-snug hover:underline">
            {line.product.title}
          </Link>
          <Price micros={line.lineTotalUsdMicros} className="text-[0.9375rem]" />
        </div>
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">
          {[line.colour, line.size && `Size ${line.size}`].filter(Boolean).join(" · ") || line.variantName}
        </p>
        {!compact && line.quantity > 1 && (
          <p className="text-[0.8125rem] text-muted-foreground">
            <Price micros={line.product.priceUsdMicros} /> each
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex h-9 items-center border border-border" role="group" aria-label={`Quantity of ${line.product.title}`}>
            <button
              type="button"
              className="grid size-9 place-items-center disabled:opacity-30"
              aria-label="Decrease quantity"
              disabled={pending || line.quantity <= 1}
              onClick={() => onQty(line.quantity - 1)}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="tabular w-7 text-center text-sm" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              className="grid size-9 place-items-center disabled:opacity-30"
              aria-label="Increase quantity"
              disabled={pending || line.quantity >= max}
              onClick={() => onQty(line.quantity + 1)}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="h-9 text-[0.8125rem] text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Remove
          </button>
        </div>
        {line.stock <= 3 && (
          <p className="mt-2 text-xs text-accent">Only {line.stock} left in this size</p>
        )}
      </div>
    </li>
  );
}
