"use client";
import Link from "@/components/link";
import { ShoppingBag } from "lucide-react";
import { SHIPPING_METHODS } from "@trestle/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BagLine } from "@/components/bag-lines";
import { Price } from "@/components/price";
import { ErrorState } from "@/components/states";
import { useCart } from "@/hooks/use-cart";
import { useHydrated } from "@/hooks/use-hydrated";
import { FreeDeliveryMeter } from "@/components/free-delivery-meter";

const FREE_OVER_MICROS = BigInt(SHIPPING_METHODS.standard.freeOverCents) * 10_000n;

export function BagView() {
  const cart = useCart();
  const hydrated = useHydrated();
  const data = cart.data;
  const subtotal = BigInt(data?.subtotalUsdMicros ?? "0");

  return (
    <div className="container-page pt-8 md:pt-12">
      <h1 className="text-[2rem] tracking-[-0.03em] md:text-[2.5rem]">Bag</h1>
      {!hydrated || cart.isLoading ? (
        <div className="mt-8 grid gap-10 md:grid-cols-12">
          <div className="space-y-6 md:col-span-8">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="aspect-[3/4] w-28" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-56 md:col-span-4" />
        </div>
      ) : cart.isError ? (
        <div className="mt-8">
          <ErrorState message="We couldn’t load your bag." retry={() => cart.refetch()} />
        </div>
      ) : !data || data.lines.length === 0 ? (
        <div className="mt-8 border-y border-border py-20 text-center">
          <ShoppingBag className="mx-auto size-8 text-muted-foreground" strokeWidth={1.25} />
          <p className="mt-4 text-lg">Your bag is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Find something you love and it will wait for you here.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link href="/women">Shop women</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/men">Shop men</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-7 lg:col-span-8">
            {data.warnings.map((w) => (
              <p
                key={w}
                role="status"
                className="mb-3 bg-warning-soft px-4 py-3 text-sm text-warning"
              >
                {w}
              </p>
            ))}
            <ul className="divide-y divide-border border-y border-border">
              {data.lines.map((l) => (
                <BagLine
                  key={l.variantId}
                  line={l}
                  pending={cart.pending}
                  onQty={(q) => cart.setQty(l.variantId, q)}
                  onRemove={() => cart.remove(l.variantId)}
                />
              ))}
            </ul>
          </div>
          <aside className="md:col-span-5 lg:col-span-4" aria-label="Order summary">
            <div className="sticky-under-header bg-muted/60 p-6 md:sticky md:top-[calc(var(--header-offset)+2rem)]">
              <h2 className="text-[0.9375rem] font-medium">Summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>
                    <Price micros={subtotal} />
                  </dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Delivery</dt>
                  <dd>
                    {subtotal >= FREE_OVER_MICROS ? "Free (standard)" : "Calculated at checkout"}
                  </dd>
                </div>
              </dl>
              <FreeDeliveryMeter subtotalMicros={subtotal} className="mt-4" />
              <Button asChild size="lg" className="mt-6 w-full">
                <Link href="/checkout">Continue to checkout</Link>
              </Button>
              <p className="mt-4 text-xs text-muted-foreground">
                Pay by card (no account needed) or with stablecoins held in escrow.{" "}
                <Link href="/payments" className="underline underline-offset-2">
                  Payment options
                </Link>
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
