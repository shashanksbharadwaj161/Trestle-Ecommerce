"use client";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { Container, ErrorState, Notice, PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SingleBarChart, SingleLineChart } from "@/components/charts";
import { api, errorMessage } from "@/lib/api";
import { usd } from "@/lib/format";

interface A {
  revenueUsdMicros: string;
  paidOrders: number;
  averageOrderUsdMicros: string;
  disputeRate: number;
  statusCounts: Record<string, number>;
  daily: { date: string; revenueUsdMicros: string; orders: number }[];
  topProducts: { id: string; title: string; units: number }[];
  reputationTrend: {
    at: string;
    score: number;
    eventType: string;
    weight: number;
    isSeedDemo: boolean;
  }[];
  includesSeedDemo: boolean;
}

export default function AnalyticsPage() {
  return <RequireAuth role="SELLER">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const q = useQuery({
    queryKey: ["seller-analytics"],
    queryFn: () => api<A>("/api/seller/analytics"),
  });
  if (q.isLoading)
    return (
      <Container>
        <Skeleton className="mb-4 h-24" />
        <Skeleton className="h-72" />
      </Container>
    );
  if (q.isError)
    return (
      <Container>
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      </Container>
    );
  const a = q.data!;
  const toUsd = (m: string) => Number(BigInt(m) / 10_000n) / 100;
  return (
    <Container>
      <PageHeader
        title="Analytics"
        description="Last 30–60 days. Revenue is order value at checkout (USD)."
      />
      {a.includesSeedDemo && (
        <Notice className="mb-4">
          Includes seeded demo orders that have no on-chain counterpart.
        </Notice>
      )}
      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Revenue", usd(a.revenueUsdMicros)],
          ["Paid orders", a.paidOrders.toLocaleString()],
          ["Average order", usd(a.averageOrderUsdMicros)],
          ["Dispute rate", `${(a.disputeRate * 100).toFixed(1)}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily revenue (USD)</CardTitle>
            <CardDescription>Last 30 days, paid orders only</CardDescription>
          </CardHeader>
          <CardContent>
            <SingleBarChart
              ariaLabel="Daily revenue bar chart"
              valueLabel="Revenue"
              data={a.daily.map((d) => ({
                label: d.date.slice(5),
                value: toUsd(d.revenueUsdMicros),
              }))}
              format={(n) => `$${n.toLocaleString()}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reputation trend</CardTitle>
            <CardDescription>
              Score after each on-chain event (per chain it was recorded on)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {a.reputationTrend.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No reputation events yet.
              </p>
            ) : (
              <SingleLineChart
                ariaLabel="Reputation score over time"
                valueLabel="Score"
                data={a.reputationTrend.map((r, i) => ({
                  label: `${new Date(r.at).toLocaleDateString("en", { month: "short", day: "numeric" })} #${i + 1}`,
                  value: Number(r.score.toFixed(2)),
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Orders by status</CardTitle>
          </CardHeader>
          <CardContent>
            <SingleBarChart
              ariaLabel="Orders by status"
              valueLabel="Orders"
              data={Object.entries(a.statusCounts).map(([k, v]) => ({
                label: k.replace("_", " ").toLowerCase(),
                value: v,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>Units sold</CardDescription>
          </CardHeader>
          <CardContent>
            {a.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <ol className="space-y-2">
                {a.topProducts.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span>
                      {i + 1}. {p.title}
                    </span>
                    <span className="tabular font-medium">{p.units}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
