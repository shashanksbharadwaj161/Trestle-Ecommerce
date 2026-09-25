"use client";
import Link from "@/components/link";
import { ShoppingBag } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/hooks/use-cart";
import { useUi } from "@/store/ui";
import { BagLine } from "./bag-lines";
import { Price } from "./price";
import { FreeDeliveryMeter } from "./free-delivery-meter";

export function BagDrawer() {
  const { bagOpen, setBag } = useUi();
  const cart = useCart();
  const data = cart.data;
  const subtotal = BigInt(data?.subtotalUsdMicros ?? "0");
  const count = cart.count;
  const close = () => setBag(false);

  return (
    <Sheet open={bagOpen} onOpenChange={setBag}>
      <SheetContent
        side="right"
        title={`Bag${count ? ` (${count})` : ""}`}
        footer={
          data && data.lines.length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-between text-[0.9375rem]">
                <span>Subtotal</span>
                <Price micros={subtotal} />
              </div>
              <p className="text-xs text-muted-foreground">
                Delivery and any promo code are applied at checkout.
              </p>
              <Button asChild size="lg" className="w-full">
                <Link href="/checkout" onClick={close}>
                  Checkout
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link href="/bag" onClick={close}>
                  View bag
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      >
        {cart.isLoading ? (
          <div className="space-y-4 p-5">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="aspect-[3/4] w-24" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : cart.isError ? (
          <div className="p-5 text-sm text-danger" role="alert">
            We couldn’t load your bag.{" "}
            <button className="underline" onClick={() => cart.refetch()}>
              Try again
            </button>
          </div>
        ) : !data || data.lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
            <ShoppingBag className="mb-4 size-8 text-muted-foreground" strokeWidth={1.25} />
            <p className="text-[0.9375rem]">Your bag is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Items you add will appear here.</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline">
                <Link href="/women" onClick={close}>
                  Shop women
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/men" onClick={close}>
                  Shop men
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5">
            <FreeDeliveryMeter subtotalMicros={subtotal} className="border-b border-border py-3" />
            {data.warnings.map((w) => (
              <p
                key={w}
                className="mt-3 bg-warning-soft px-3 py-2 text-xs text-warning"
                role="status"
              >
                {w}
              </p>
            ))}
            <ul className="divide-y divide-border">
              {data.lines.map((l) => (
                <BagLine
                  key={l.variantId}
                  line={l}
                  compact
                  pending={cart.pending}
                  onNavigate={close}
                  onQty={(q) => cart.setQty(l.variantId, q)}
                  onRemove={() => cart.remove(l.variantId)}
                />
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
