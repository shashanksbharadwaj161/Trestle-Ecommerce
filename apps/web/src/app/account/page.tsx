"use client";
import Image from "next/image";
import Link from "@/components/link";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { CardPaymentBadge, OrderStatusBadge, SeedDemoBadge } from "@/components/status-badge";
import { Price } from "@/components/price";
import { api, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { SessionUser } from "@/hooks/use-session";

interface OrderRow {
  id: string;
  status: string;
  createdAt: string;
  paymentMethod: "CARD" | "CRYPTO";
  subtotalUsdMicros: string;
  isSeedDemo: boolean;
  trackingNumber: string | null;
  seller: { storefrontName: string };
  items: {
    titleSnapshot: string;
    variantSnapshot: string;
    quantity: number;
    imageSnapshot: string | null;
    product: { images: string[] };
  }[];
  cardPayment: { id: string; status: string; totalCents: number } | null;
}

export default function AccountPage() {
  return <RequireAuth title="Sign in to see your orders">{(u) => <Orders user={u} />}</RequireAuth>;
}

function Orders({ user }: { user: SessionUser }) {
  const q = useQuery({
    queryKey: ["orders", "buyer"],
    queryFn: () => api<{ items: OrderRow[] }>("/api/orders?as=buyer&take=50"),
  });
  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow={user.email ?? user.displayName ?? "Your account"}
        title={user.displayName ? `Hello, ${user.displayName.split(" ")[0]}` : "Your orders"}
        description="Track deliveries, request returns and see past orders."
      />
      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When you place an order it will appear here with its tracking and returns."
          action={{ href: "/women", label: "Start shopping" }}
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {q.data!.items.map((o) => {
            const href =
              o.paymentMethod === "CARD" && o.cardPayment
                ? `/order-status/${o.cardPayment.id}`
                : `/orders/${o.id}`;
            const img = o.items[0]?.imageSnapshot ?? o.items[0]?.product.images[0];
            return (
              <li key={o.id}>
                <Link href={href} className="flex gap-4 py-5 transition-colors hover:bg-muted/40">
                  <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden bg-muted">
                    {img && <Image src={img} alt="" fill sizes="64px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={o.status} />
                      {o.cardPayment && o.cardPayment.status !== "PAID" && (
                        <CardPaymentBadge status={o.cardPayment.status} />
                      )}
                      {o.isSeedDemo && <SeedDemoBadge />}
                    </div>
                    <p className="mt-2 truncate text-sm">
                      {o.items
                        .map((i) => `${i.titleSnapshot}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
                        .join(", ")}
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                      {o.seller.storefrontName} · {dateTime(o.createdAt)} ·{" "}
                      {o.paymentMethod === "CARD" ? "Card" : "Stablecoin escrow"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <Price micros={o.subtotalUsdMicros} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
