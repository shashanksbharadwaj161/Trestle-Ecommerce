"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Fingerprint, Fuel } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { ConnectWallet } from "@/components/connect";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/status-badge";
import { AddressLink, ChainBadge, TxLink } from "@/components/chain";
import { api, errorMessage } from "@/lib/api";
import { dateTime, scoreFromWad, shortAddress, tokenAmount, usd } from "@/lib/format";
import type { SessionUser } from "@/hooks/use-session";

interface Rep {
  scoreWad: string;
  accounts: {
    address: string;
    chainId: number;
    chainName: string;
    tokenId: string;
    scoreWad: string;
    positiveEvents: number;
    negativeEvents: number;
  }[];
  breakdown: Record<string, { count: number; weight: number }>;
  events: {
    id: string;
    eventType: string;
    weight: number;
    newScore: string;
    chainId: number;
    txHash: string | null;
    createdAt: string;
    isSeedDemo: boolean;
  }[];
}
interface Orders {
  items: {
    id: string;
    status: string;
    createdAt: string;
    subtotalUsdMicros: string;
    isSeedDemo: boolean;
    seller: { storefrontName: string };
    items: { titleSnapshot: string; quantity: number; product: { images: string[] } }[];
    paymentIntents: { routeKind: string; sourceChainId: number; destChainId: number }[];
  }[];
}
interface AA {
  accounts: {
    chainId: number;
    chainName: string;
    address: string | null;
    deployed: boolean;
    sponsoredGasRemainingWei: string | null;
  }[];
  gasless: boolean;
}

const LABELS: Record<string, string> = {
  PURCHASE_COMPLETED: "Completed purchases",
  SALE_COMPLETED: "Completed sales",
  AUTO_RELEASED: "Auto-released sales",
  DISPUTE_WON: "Disputes won",
  DISPUTE_LOST: "Disputes lost",
  DISPUTE_SPLIT: "Split outcomes",
  SELLER_REFUNDED: "Voluntary refunds",
};

export function WalletView() {
  return (
    <RequireAuth
      title="Sign in to see your wallet & escrow"
      wallet
      walletAction={<ConnectWallet label="Connect & link wallet" />}
    >
      {(user) => <Account user={user} />}
    </RequireAuth>
  );
}

function Account({ user }: { user: SessionUser }) {
  const rep = useQuery({
    queryKey: ["reputation", user.walletAddress],
    queryFn: () => api<Rep>(`/api/reputation/${user.walletAddress}`),
  });
  const orders = useQuery({
    queryKey: ["orders", "buyer"],
    queryFn: () => api<Orders>("/api/orders?as=buyer&take=50"),
  });
  const aa = useQuery({ queryKey: ["aa-account"], queryFn: () => api<AA>("/api/aa/account") });
  const score = rep.data ? scoreFromWad(rep.data.scoreWad) : null;

  return (
    <Container>
      <PageHeader
        title="Wallet & escrow"
        eyebrow="Stablecoin payments"
        description={<span className="font-mono break-all">{user.walletAddress}</span>}
        actions={
          <Link href="/account/loyalty" className="text-sm underline underline-offset-4">
            Loyalty &amp; staking →
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" aria-hidden /> Reputation
            </CardTitle>
            <CardDescription>
              Soulbound (ERC-5192), decays over time, earned only from on-chain outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rep.isLoading ? (
              <Skeleton className="h-40" />
            ) : rep.isError ? (
              <ErrorState message={errorMessage(rep.error)} retry={() => rep.refetch()} />
            ) : (
              <>
                <p className="tabular text-4xl font-semibold">{score?.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">
                  live score across {rep.data!.accounts.length} soulbound token
                  {rep.data!.accounts.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {Object.entries(rep.data!.breakdown).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {LABELS[k] ?? k} ({v.count})
                      </span>
                      <span className={`tabular ${v.weight < 0 ? "text-danger" : "text-success"}`}>
                        {v.weight > 0 ? "+" : ""}
                        {v.weight}
                      </span>
                    </li>
                  ))}
                  {Object.keys(rep.data!.breakdown).length === 0 && (
                    <li className="text-muted-foreground">
                      No reputation events yet — complete an order to start building it.
                    </li>
                  )}
                </ul>
                {rep.data!.accounts.map((a) => (
                  <div
                    key={a.chainId + a.address}
                    className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <ChainBadge chainId={a.chainId} />{" "}
                      <AddressLink chainId={a.chainId} address={a.address} />
                    </span>
                    <span className="tabular">
                      #{a.tokenId} · {scoreFromWad(a.scoreWad).toFixed(1)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="size-4 text-primary" aria-hidden /> Gasless smart accounts
            </CardTitle>
            <CardDescription>
              Counterfactual ERC-4337 SimpleAccounts owned by your wallet. Orders placed with the
              gasless option are managed from these; the Trestle paymaster sponsors their gas up to
              a daily cap. They deploy automatically on first use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aa.isLoading ? (
              <Skeleton className="h-24" />
            ) : aa.isError ? (
              <ErrorState message={errorMessage(aa.error)} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {aa.data!.accounts.map((a) => (
                  <div key={a.chainId} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <ChainBadge chainId={a.chainId} />
                      <Badge tone={a.deployed ? "success" : "neutral"}>
                        {a.deployed ? "Deployed" : "Not yet deployed"}
                      </Badge>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs">{a.address ?? "unavailable"}</p>
                    {a.sponsoredGasRemainingWei && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sponsored gas left today: {tokenAmount(a.sponsoredGasRemainingWei, 18, 5)}{" "}
                        ETH
                      </p>
                    )}
                  </div>
                ))}
                {!aa.data!.gasless && (
                  <p className="text-sm text-warning">
                    Gasless bundling is not configured on this deployment.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="orders-h">
        <h2 id="orders-h" className="mb-3 text-xl font-semibold">
          Order history
        </h2>
        {orders.isLoading ? (
          <Skeleton className="h-48" />
        ) : orders.isError ? (
          <ErrorState message={errorMessage(orders.error)} retry={() => orders.refetch()} />
        ) : orders.data!.items.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="When you buy something it shows up here with its escrow status."
            action={{ href: "/products", label: "Browse products" }}
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {orders.data!.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.items[0]?.product.images[0]}
                    alt=""
                    className="size-12 rounded-lg border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {o.items.map((i) => i.titleSnapshot).join(", ")}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {o.seller.storefrontName} · {dateTime(o.createdAt)}
                      {o.paymentIntents[0] &&
                        o.paymentIntents[0].sourceChainId !== o.paymentIntents[0].destChainId && (
                          <Badge tone="info">cross-chain</Badge>
                        )}
                      {o.isSeedDemo && <Badge tone="outline">demo record</Badge>}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                  <span className="tabular hidden w-24 text-right font-medium sm:block">
                    {usd(o.subtotalUsdMicros)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rep.data && rep.data.events.length > 0 && (
        <section className="mt-8" aria-labelledby="rep-h">
          <h2 id="rep-h" className="mb-3 text-xl font-semibold">
            Reputation history
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Table (scrolls horizontally)">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Event</th>
                  <th className="p-3 font-medium">Weight</th>
                  <th className="p-3 font-medium">Score after</th>
                  <th className="p-3 font-medium">Chain</th>
                  <th className="p-3 font-medium">Tx</th>
                  <th className="p-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {rep.data.events.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-3">{LABELS[e.eventType] ?? e.eventType}</td>
                    <td className={`tabular p-3 ${e.weight < 0 ? "text-danger" : "text-success"}`}>
                      {e.weight > 0 ? "+" : ""}
                      {e.weight}
                    </td>
                    <td className="tabular p-3">{Number(e.newScore).toFixed(2)}</td>
                    <td className="p-3">
                      <ChainBadge chainId={e.chainId} />
                    </td>
                    <td className="p-3">
                      {e.isSeedDemo ? (
                        <Badge tone="outline">demo</Badge>
                      ) : (
                        <TxLink chainId={e.chainId} hash={e.txHash} />
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{dateTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Addresses: {shortAddress(user.walletAddress)} and your smart accounts.
          </p>
        </section>
      )}
    </Container>
  );
}
