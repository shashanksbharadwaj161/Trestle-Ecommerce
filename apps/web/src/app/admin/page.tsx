"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { Container, ErrorState, Notice, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";

interface Overview {
  card: { enabled: boolean; mode: string | null; reason?: string };
  toShip: number;
  orders: { method: string; status: string; count: number }[];
  attention: { id: string; status: string; failureReason: string; createdAt: string }[];
  openReturns: number;
  unreadMessages: number;
  lowStockSkus: number;
  soldOutSkus: number;
  products: { status: string; count: number }[];
  sellers: number;
}

export default function AdminHome() {
  return <RequireAuth role="ADMIN">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/api/admin/overview"), refetchInterval: 30_000 });
  return (
    <Container>
      <PageHeader title="Store overview" description="What needs attention right now." />
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : (
        <Body o={q.data!} />
      )}
    </Container>
  );
}

function Body({ o }: { o: Overview }) {
  const tiles = [
    { label: "Paid orders to ship", value: o.toShip, href: "/admin/orders?status=PROCESSING" },
    { label: "Open returns", value: o.openReturns, href: "/admin/returns" },
    { label: "Unread messages", value: o.unreadMessages, href: "/admin/messages" },
    { label: "SKUs with ≤ 3 left", value: o.lowStockSkus, href: "/admin/products" },
    { label: "Sold-out SKUs", value: o.soldOutSkus, href: "/admin/products" },
    { label: "Sellers", value: o.sellers, href: "/admin/sellers" },
  ];
  return (
    <div className="space-y-10">
      {!o.card.enabled ? (
        <Notice tone="warning">Card payments are not configured: {o.card.reason} See docs/CONNECTION_HANDOFF.md.</Notice>
      ) : (
        <Notice tone="info">Card payments are in Stripe {o.card.mode} mode — no real charges. Live mode is disabled in this build.</Notice>
      )}
      <ul className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label} className="bg-background">
            <Link href={t.href} className="block p-6 hover:bg-muted/50">
              <p className="tabular text-3xl">{t.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.label}</p>
            </Link>
          </li>
        ))}
      </ul>
      {o.attention.length > 0 && (
        <section>
          <h2 className="text-[0.9375rem] font-medium">Card payments needing review</h2>
          <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
            {o.attention.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-3">
                <Link href={`/order-status/${a.id}`} className="underline underline-offset-4">
                  {a.id}
                </Link>
                <span className="text-danger">{a.failureReason}</span>
                <span className="text-muted-foreground">{dateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="text-[0.9375rem] font-medium">Orders by status</h2>
        <table className="mt-3 w-full max-w-lg text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Payment</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {o.orders.map((r) => (
              <tr key={`${r.method}-${r.status}`} className="border-t border-border">
                <td className="py-2">{r.method === "CARD" ? "Card" : "Stablecoin"}</td>
                <td className="py-2">{r.status.replace("_", " ").toLowerCase()}</td>
                <td className="tabular py-2 text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
