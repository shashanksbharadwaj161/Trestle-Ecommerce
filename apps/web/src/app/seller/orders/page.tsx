"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/status-badge";
import { api, errorMessage } from "@/lib/api";
import { dateTime, shortAddress, usd } from "@/lib/format";

interface Orders {
  items: {
    id: string;
    status: string;
    createdAt: string;
    subtotalUsdMicros: string;
    isSeedDemo: boolean;
    trackingNumber: string | null;
    buyer: { displayName: string | null; walletAddress: string };
    items: { titleSnapshot: string; variantSnapshot: string; quantity: number }[];
    paymentIntents: { routeKind: string }[];
    dispute: { status: string } | null;
  }[];
}

export default function SellerOrdersPage() {
  return <RequireAuth role="SELLER">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const [status, setStatus] = useState("");
  const q = useQuery({
    queryKey: ["seller-orders", status],
    queryFn: () => api<Orders>(`/api/orders?as=seller&take=50${status ? `&status=${status}` : ""}`),
  });
  return (
    <Container>
      <PageHeader
        title="Orders"
        description="Ship escrowed orders and track settlement. Funds release on buyer confirmation, the delivery deadline, or arbitration."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              <option value="">All</option>
              {[
                "PENDING_PAYMENT",
                "ESCROWED",
                "SHIPPED",
                "DELIVERED",
                "DISPUTED",
                "COMPLETED",
                "REFUNDED",
                "CANCELLED",
              ].map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </Select>
          </label>
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-72" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState
          title={status ? "No orders with this status" : "No orders yet"}
          description="Orders appear here as soon as a buyer's payment is initiated."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Order</th>
                <th className="p-3 font-medium">Items</th>
                <th className="p-3 font-medium">Buyer</th>
                <th className="p-3 font-medium">Total</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-muted/40">
                  <td className="p-3">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {o.id.slice(0, 14)}
                    </Link>
                    {o.isSeedDemo && (
                      <Badge tone="outline" className="ml-2">
                        demo
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {o.items
                      .map((i) => `${i.titleSnapshot} (${i.variantSnapshot}) ×${i.quantity}`)
                      .join(", ")}
                  </td>
                  <td className="p-3">
                    {o.buyer.displayName ?? shortAddress(o.buyer.walletAddress)}
                  </td>
                  <td className="tabular p-3">{usd(o.subtotalUsdMicros)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <OrderStatusBadge status={o.status} />
                      {o.paymentIntents[0]?.routeKind === "CROSS_CHAIN" && (
                        <Badge tone="info">cross-chain</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{dateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
