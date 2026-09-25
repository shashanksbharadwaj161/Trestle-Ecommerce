"use client";
import Link from "@/components/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@trestle/shared";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardPaymentBadge, OrderStatusBadge, SeedDemoBadge } from "@/components/status-badge";
import { Price } from "@/components/price";
import { api, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";

interface Row {
  id: string;
  status: string;
  paymentMethod: "CARD" | "CRYPTO";
  createdAt: string;
  subtotalUsdMicros: string;
  isSeedDemo: boolean;
  trackingNumber: string | null;
  seller: { storefrontName: string };
  buyer: { displayName: string | null; email: string | null; walletAddress: string | null } | null;
  items: { titleSnapshot: string; variantSnapshot: string; quantity: number }[];
  cardPayment: {
    id: string;
    status: string;
    email: string | null;
    totalCents: number;
    failureReason: string | null;
  } | null;
  returnRequests: { id: string; status: string }[];
}

const STATUSES = [
  "PENDING_PAYMENT",
  "PROCESSING",
  "ESCROWED",
  "SHIPPED",
  "DELIVERED",
  "DISPUTED",
  "COMPLETED",
  "REFUNDED",
  "CANCELLED",
];

export default function AdminOrders() {
  return (
    <RequireAuth role="ADMIN">
      {() => (
        <Suspense>
          <Inner />
        </Suspense>
      )}
    </RequireAuth>
  );
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(sp.get("q") ?? "");
  const params = new URLSearchParams(sp.toString());
  const q = useQuery({
    queryKey: ["admin-orders", params.toString()],
    queryFn: () =>
      api<{ items: Row[]; total: number; page: number; pageCount: number }>(
        `/api/admin/orders?${params.toString()}`,
      ),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("page");
    router.push(`/admin/orders?${next.toString()}`);
  };
  return (
    <Container>
      <PageHeader title="Orders" description="Card and stablecoin orders across all sellers." />
      <div className="mb-5 flex flex-wrap gap-3">
        <Select
          aria-label="Payment method"
          value={sp.get("method") ?? ""}
          onChange={(e) => set("method", e.target.value)}
          className="h-10 w-44"
        >
          <option value="">All payments</option>
          <option value="CARD">Card</option>
          <option value="CRYPTO">Stablecoin</option>
        </Select>
        <Select
          aria-label="Status"
          value={sp.get("status") ?? ""}
          onChange={(e) => set("status", e.target.value)}
          className="h-10 w-48"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </Select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", search.trim());
          }}
        >
          <Input
            aria-label="Search orders"
            placeholder="Order id, email, tracking"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-64"
          />
          <Button type="submit" variant="outline" size="sm" className="h-10">
            Search
          </Button>
        </form>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="No orders match" />
      ) : (
        <>
          <div
            className="overflow-x-auto border border-border"
            tabIndex={0}
            role="region"
            aria-label="Table (scrolls horizontally)"
          >
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Orders</caption>
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Items
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Payment
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="p-3 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data!.items.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="p-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-xs underline underline-offset-4"
                      >
                        {o.id}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{dateTime(o.createdAt)}</p>
                      {o.isSeedDemo && <SeedDemoBadge />}
                    </td>
                    <td className="p-3 text-xs">
                      {o.buyer?.displayName ?? o.cardPayment?.email ?? "Guest"}
                      <p className="text-muted-foreground">
                        {o.buyer?.email ?? o.cardPayment?.email ?? ""}
                      </p>
                    </td>
                    <td className="p-3 text-xs">
                      {o.items.map((i) => (
                        <p key={i.titleSnapshot + i.variantSnapshot}>
                          {i.titleSnapshot} · {i.variantSnapshot} ×{i.quantity}
                        </p>
                      ))}
                      <p className="text-muted-foreground">{o.seller.storefrontName}</p>
                    </td>
                    <td className="p-3">
                      {o.paymentMethod === "CARD" ? (
                        o.cardPayment ? (
                          <CardPaymentBadge status={o.cardPayment.status} />
                        ) : (
                          "Card"
                        )
                      ) : (
                        <span className="text-xs">Stablecoin escrow</span>
                      )}
                      {o.cardPayment?.failureReason && (
                        <p className="mt-1 text-xs text-danger">{o.cardPayment.failureReason}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <OrderStatusBadge status={o.status} />
                      {o.returnRequests.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {o.returnRequests.length} return request(s)
                        </p>
                      )}
                    </td>
                    <td className="tabular p-3 text-right">
                      <Price micros={o.subtotalUsdMicros} />
                      {o.cardPayment && (
                        <p className="text-xs text-muted-foreground">
                          payment {formatCents(o.cardPayment.totalCents)}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {q.data!.total} orders · page {q.data!.page} of {q.data!.pageCount}
            {q.data!.page < q.data!.pageCount && (
              <button
                className="ml-4 underline"
                onClick={() => set("page", String(q.data!.page + 1))}
              >
                Next page
              </button>
            )}
          </p>
        </>
      )}
    </Container>
  );
}
