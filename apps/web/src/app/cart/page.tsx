"use client";
import Link from "next/link";
import { BadgeCheck, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useHydrated } from "@/hooks/use-hydrated";
import { Container, EmptyState, ErrorState, Notice, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainBadge } from "@/components/chain";
import { usd } from "@/lib/format";

export default function CartPage() {
  const cart = useCart();
  const hydrated = useHydrated();
  if (!hydrated || cart.isLoading) {
    return (
      <Container aria-busy="true">
        <Skeleton className="mb-6 h-9 w-40" />
        <Skeleton className="h-64" />
      </Container>
    );
  }
  if (cart.isError)
    return (
      <Container>
        <ErrorState message="We couldn't load your cart." retry={() => cart.refetch()} />
      </Container>
    );
  const data = cart.data;
  if (!data || data.lines.length === 0) {
    return (
      <Container>
        <PageHeader title="Your cart" />
        <EmptyState
          icon={<ShoppingBag className="size-5" />}
          title="Your cart is empty"
          description="Browse certified, escrow-protected products from verified sellers."
          action={{ href: "/products", label: "Start shopping" }}
        />
      </Container>
    );
  }
  return (
    <Container>
      <PageHeader
        title="Your cart"
        description={`${cart.count} item${cart.count === 1 ? "" : "s"} · orders are placed per seller, each with its own escrow`}
      />
      {data.warnings.map((w) => (
        <Notice key={w} tone="warning" className="mb-3">
          {w}
        </Notice>
      ))}
      {!cart.authed && (
        <Notice tone="info" className="mb-4">
          Your cart is saved in this browser. It moves to your account when you sign in at checkout.
        </Notice>
      )}
      <div className="space-y-6">
        {data.groups.map((g) => (
          <Card key={g.seller.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-1.5">
                {g.seller.storefrontName}
                {g.seller.verified && (
                  <BadgeCheck className="size-4 text-primary" aria-label="Verified seller" />
                )}
              </CardTitle>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Seller paid on <ChainBadge chainId={g.seller.payoutChainId} />
              </span>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {g.lines.map((l) => (
                  <li key={l.variantId} className="flex gap-4 py-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.product.images[0]}
                      alt=""
                      className="size-20 rounded-lg border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${l.product.id}`}
                        className="font-medium hover:underline"
                      >
                        {l.product.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">{l.variantName}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-input">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Decrease quantity of ${l.product.title}`}
                            onClick={() => cart.setQty(l.variantId, l.quantity - 1)}
                          >
                            <Minus />
                          </Button>
                          <span className="tabular w-6 text-center text-sm" aria-live="polite">
                            {l.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Increase quantity of ${l.product.title}`}
                            disabled={l.quantity >= l.stock}
                            onClick={() => cart.setQty(l.variantId, l.quantity + 1)}
                          >
                            <Plus />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cart.remove(l.variantId)}
                          aria-label={`Remove ${l.product.title}`}
                        >
                          <Trash2 /> Remove
                        </Button>
                      </div>
                    </div>
                    <p className="tabular font-medium">{usd(l.lineTotalUsdMicros)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="justify-between">
              <p className="text-sm">
                Subtotal{" "}
                <span className="tabular ml-1 font-semibold">{usd(g.subtotalUsdMicros)}</span>
              </p>
              <Button asChild>
                <Link href={`/checkout?seller=${g.seller.id}`}>
                  Checkout with {g.seller.storefrontName}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </Container>
  );
}
