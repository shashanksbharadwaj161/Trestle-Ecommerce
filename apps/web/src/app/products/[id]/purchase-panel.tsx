"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useCart } from "@/hooks/use-cart";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/api";

interface Props {
  product: {
    id: string;
    title: string;
    sellerId: string;
    status: string;
    chainListingOptions: number[];
    variants: { id: string; name: string; stock: number; sku: string }[];
  };
  chains: { id: number; name: string }[];
}

export function PurchasePanel({ product, chains }: Props) {
  const router = useRouter();
  const cart = useCart();
  const firstAvailable = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const [qty, setQty] = useState(1);
  const variant = product.variants.find((v) => v.id === variantId);
  const soldOut = !variant || variant.stock === 0 || product.status !== "ACTIVE";

  async function add(buyNow: boolean) {
    if (!variant) return;
    try {
      await cart.add(variant.id, qty);
      if (buyNow) router.push(`/checkout?seller=${product.sellerId}`);
      else toast.success(`Added ${qty} × ${product.title} to your cart`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {product.variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Option</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === variantId}
                disabled={v.stock === 0}
                onClick={() => {
                  setVariantId(v.id);
                  setQty(1);
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-50",
                  v.id === variantId
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-input hover:bg-muted",
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center gap-4">
        <div>
          <Label htmlFor="qty" className="sr-only">
            Quantity
          </Label>
          <div className="flex items-center rounded-lg border border-input">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Decrease quantity"
              onClick={() => setQty(Math.max(1, qty - 1))}
              disabled={qty <= 1}
            >
              <Minus />
            </Button>
            <output id="qty" className="tabular w-8 text-center" aria-live="polite">
              {qty}
            </output>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Increase quantity"
              onClick={() => setQty(Math.min(variant?.stock ?? 1, qty + 1, 20))}
              disabled={!variant || qty >= Math.min(variant.stock, 20)}
            >
              <Plus />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {soldOut
            ? "Sold out"
            : variant!.stock <= 3
              ? `Only ${variant!.stock} left`
              : `${variant!.stock} in stock`}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="flex-1"
          disabled={soldOut}
          loading={cart.pending}
          onClick={() => add(true)}
        >
          <Zap /> Buy now
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          disabled={soldOut}
          onClick={() => add(false)}
        >
          <ShoppingBag /> Add to cart
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pay from:{" "}
        {chains
          .filter((c) => product.chainListingOptions.includes(c.id))
          .map((c) => c.name)
          .join(" · ")}{" "}
        — ETH, tUSDC or tDAI.
      </p>
    </div>
  );
}
