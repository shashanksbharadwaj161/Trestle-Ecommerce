"use client";
import Link from "@/components/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Fuel, Landmark, Radio, ShieldCheck } from "lucide-react";
import { Container, EmptyState, PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddressLink, ChainBadge, TxLink } from "@/components/chain";
import { IntentStatusBadge, OrderStatusBadge } from "@/components/status-badge";
import { SingleBarChart } from "@/components/charts";
import { api } from "@/lib/api";
import { duration, tokenAmount, usd } from "@/lib/format";
import { RelativeTime } from "@/components/relative-time";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Stats = any;

export function TransparencyView({ initial }: { initial: Stats }) {
  const q = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<Stats>("/api/admin/stats"),
    initialData: initial,
    refetchInterval: 8_000,
  });
  const s = q.data;
  const orderStatus = Object.entries(s.ordersByStatus as Record<string, number>).map(([k, v]) => ({
    label: k.replace("_", " ").toLowerCase(),
    value: v,
  }));
  return (
    <Container>
      <PageHeader
        eyebrow="Public · live"
        title="Protocol transparency"
        description="Every number here is computed from indexed contract events or read live from the contracts — not hardcoded. Seeded demo records without on-chain transactions are excluded and counted separately."
        actions={
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="size-3.5 text-success" aria-hidden /> refreshes every 8s · updated{" "}
            <RelativeTime date={s.generatedAt} />
          </span>
        }
      />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { k: "Live escrows", v: s.liveEscrows, icon: Landmark },
          {
            k: "Volume settled",
            v: usd(s.volumeSettledUsdMicros, { cents: false }),
            icon: Activity,
          },
          {
            k: "Median cross-chain settlement",
            v: duration(s.settlement.medianSeconds),
            icon: Radio,
          },
          { k: "Sponsored user ops", v: s.sponsoredOps, icon: Fuel },
          { k: "Contract events indexed", v: s.chainEvents, icon: ShieldCheck },
        ].map(({ k, v, icon: Icon }) => (
          <div key={k} className="rounded-xl border border-border bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" aria-hidden /> {k}
            </dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {s.seedDemoOrders > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {s.seedDemoOrders} seeded demo order(s) excluded from these figures.
        </p>
      )}

      <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Chains">
        {s.chains.map((c: any) => (
          <Card key={c.chainId}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{c.name}</CardTitle>
                <CardDescription>
                  Chain {c.role} · id {c.chainId}
                </CardDescription>
              </div>
              <Badge tone={c.online ? "success" : "danger"}>
                {c.online ? "online" : c.deployed ? "unreachable" : "not deployed"}
              </Badge>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Head / indexed block</p>
                <p className="tabular">
                  {c.blockNumber ?? "—"} / {c.indexedBlock ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paymaster deposit</p>
                <p className="tabular">
                  {c.paymasterDeposit ? `${tokenAmount(c.paymasterDeposit, 18, 4)} ETH` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Solver liquidity</p>
                {(c.liquidity ?? []).map((l: any) => (
                  <p key={l.symbol} className="tabular">
                    {tokenAmount(l.amount, l.decimals, 2)} {l.symbol}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Held in escrow</p>
                {(c.escrowBalances ?? []).map((l: any) => (
                  <p key={l.symbol} className="tabular">
                    {tokenAmount(l.amount, l.decimals, 2)} {l.symbol}
                  </p>
                ))}
              </div>
              {c.contracts && (
                <div className="col-span-2 grid grid-cols-2 gap-1 border-t border-border pt-3 text-xs">
                  {Object.entries(c.contracts as Record<string, string>).map(([k, a]) => (
                    <p key={k} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{k}</span>
                      <AddressLink chainId={c.chainId} address={a} />
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-8" aria-labelledby="intents-h">
        <h2 id="intents-h" className="mb-3 text-xl font-semibold">
          Payment intents &amp; settlement proofs
        </h2>
        {s.recentIntents.length === 0 ? (
          <EmptyState
            title="No on-chain payments yet"
            description="Complete a checkout and it appears here within seconds."
            action={{ href: "/products", label: "Go shopping" }}
          />
        ) : (
          <div
            className="overflow-x-auto rounded-xl border border-border bg-card"
            tabIndex={0}
            role="region"
            aria-label="Recent escrow activity (scrolls horizontally)"
          >
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Route</th>
                  <th className="p-3 font-medium">Order</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Source tx (payment)</th>
                  <th className="p-3 font-medium">Fulfilment (dest)</th>
                  <th className="p-3 font-medium">Settlement proof (source)</th>
                  <th className="p-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {s.recentIntents.map((i: any) => (
                  <tr key={i.id} className="border-t border-border align-top">
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <ChainBadge chainId={i.sourceChainId} />
                        <span aria-hidden>→</span>
                        <span className="sr-only">to</span>
                        <ChainBadge chainId={i.destChainId} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {i.routeKind === "CROSS_CHAIN" ? "attested relay" : "direct escrow"} · score{" "}
                        {i.securityScore}
                      </p>
                    </td>
                    <td className="p-3">
                      <p className="font-mono text-xs">{i.order.id.slice(0, 12)}</p>
                      <p className="text-xs">{usd(i.order.subtotalUsdMicros)}</p>
                      <OrderStatusBadge status={i.order.status} />
                    </td>
                    <td className="p-3">
                      <IntentStatusBadge status={i.status} />
                      {i.failureReason && (
                        <p className="mt-1 max-w-40 text-xs text-danger">{i.failureReason}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <TxLink chainId={i.sourceChainId} hash={i.sourceTxHash} />
                    </td>
                    <td className="p-3">
                      <TxLink chainId={i.destChainId} hash={i.fulfillTxHash} />
                      {i.escrowOrderId && (
                        <p className="text-xs text-muted-foreground">escrow #{i.escrowOrderId}</p>
                      )}
                    </td>
                    <td className="p-3">
                      {i.routeKind === "CROSS_CHAIN" ? (
                        <TxLink chainId={i.sourceChainId} hash={i.settleTxHash ?? i.failTxHash} />
                      ) : (
                        <span className="text-xs text-muted-foreground">n/a (no bridge)</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      <RelativeTime date={i.updatedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders by status</CardTitle>
            <CardDescription>On-chain-backed orders only</CardDescription>
          </CardHeader>
          <CardContent>
            {orderStatus.length ? (
              <SingleBarChart ariaLabel="Orders by status" valueLabel="Orders" data={orderStatus} />
            ) : (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dispute outcomes</CardTitle>
            <CardDescription>Resolved by arbiters on-chain via resolveDispute</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Open", s.disputes.open],
                ["Full refunds", s.disputes.refunded],
                ["Splits", s.disputes.split],
                ["Seller won", s.disputes.sellerWon],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="tabular text-xl font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Gas sponsored by the paymaster: {tokenAmount(s.gasSponsoredWei, 18, 6)} ETH across{" "}
              {s.sponsoredOps} user operations.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="events-h">
        <h2 id="events-h" className="mb-3 text-xl font-semibold">
          Contract event feed
        </h2>
        {s.recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events indexed yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {s.recentEvents.map((e: any) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 p-3">
                <ChainBadge chainId={e.chainId} />
                <Badge tone="outline">{e.contract}</Badge>
                <span className="font-medium">{e.eventName}</span>
                <span className="text-xs text-muted-foreground">block {e.blockNumber}</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <TxLink chainId={e.chainId} hash={e.txHash} />{" "}
                  <RelativeTime date={e.blockTime ?? e.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="trust-model" className="mt-8" aria-labelledby="trust-h">
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle id="trust-h" className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" aria-hidden /> Trust model &amp;
              disclosures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Cross-chain messages:</strong>{" "}
              {s.trustModel.disclosure} Adapter: <code>{s.trustModel.adapter}</code>, attesters:{" "}
              {s.trustModel.attesters}.
            </p>
            <p>
              <strong className="text-foreground">No asset teleportation:</strong> a solver funds
              the seller&apos;s escrow from liquidity it already holds on the destination chain and
              is repaid from the buyer&apos;s locked payment only after an attested fulfilment
              receipt. Intent ids are unique per (chain, router, nonce) and fulfil at most once.
            </p>
            <p>
              <strong className="text-foreground">Account abstraction:</strong> gasless actions use
              real ERC-4337 v0.7 (EntryPoint, SimpleAccount, TrestlePaymaster) but are bundled by
              Trestle&apos;s own minimal server-side bundler, not a public bundler mempool.
            </p>
            <p>
              <strong className="text-foreground">Prices:</strong> ETH/USD comes from a configured
              demo price table, not an oracle. Tokens (tUSDC, tDAI) are test tokens with no value.
            </p>
            <p>
              <Link href="/products" className="text-primary hover:underline">
                Back to the shop
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </Container>
  );
}
