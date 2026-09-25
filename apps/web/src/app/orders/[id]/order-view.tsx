"use client";
import Link from "@/components/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleDot,
  Fuel,
  Gavel,
  PackageCheck,
  ShieldCheck,
  Star,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { Container, ErrorState, Notice } from "@/components/states";
import { OrderStatusBadge, IntentStatusBadge, SeedDemoBadge } from "@/components/status-badge";
import { AddressLink, ChainBadge, TxLink } from "@/components/chain";
import { TxSteps } from "@/components/tx-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useExecuteCalls, useGasless, type TxCall } from "@/hooks/use-tx";
import { api, errorMessage } from "@/lib/api";
import { dateTime, shortAddress, tokenAmount, usd } from "@/lib/format";
import { cn } from "@/lib/cn";

interface TimelineEntry {
  status: string;
  at: string;
  chainId?: number;
  txHash?: string;
  note?: string;
}
interface Intent {
  id: string;
  routeKind: "DIRECT" | "CROSS_CHAIN";
  routeId: string;
  status: string;
  sourceChainId: number;
  destChainId: number;
  sourceToken: string;
  sourceAmount: string;
  feeAmount: string;
  destToken: string;
  destAmount: string;
  destBuyer: string;
  onchainIntentId: string | null;
  sourceTxHash: string | null;
  fulfillTxHash: string | null;
  settleTxHash: string | null;
  failTxHash: string | null;
  failureReason: string | null;
  escrowOrderId: string | null;
  securityScore: number;
  expiresAt: string;
  txHashes: TimelineEntry[];
  lastError: string | null;
}
interface OrderResp {
  viewer: "buyer" | "seller" | "admin";
  gasless: boolean;
  tokens: Record<string, { symbol: string; decimals: number }>;
  order: {
    id: string;
    status: string;
    createdAt: string;
    subtotalUsdMicros: string;
    payoutChainId: number;
    payoutToken: string;
    payoutAmount: string;
    escrowChainId: number | null;
    escrowContractOrderId: string | null;
    buyerAccount: string | null;
    deliveryDeadline: string | null;
    trackingNumber: string | null;
    shippedAt: string | null;
    completedAt: string | null;
    isSeedDemo: boolean;
    shippingAddress: Record<string, string> | null;
    items: {
      id: string;
      titleSnapshot: string;
      variantSnapshot: string;
      quantity: number;
      unitPriceUsdMicros: string;
      product: { id: string; images: string[] };
    }[];
    seller: { storefrontName: string; payoutAddress: string; user: { walletAddress: string } };
    buyer: { walletAddress: string; displayName: string | null };
    paymentIntents: Intent[];
    dispute: null | {
      status: string;
      reason: string;
      evidence: string | null;
      raisedByAddress: string;
      raiseTxHash: string | null;
      resolveTxHash: string | null;
      buyerShareBps: number | null;
      resolutionNotes: string | null;
      createdAt: string;
      resolvedAt: string | null;
    };
    review: null | { rating: number; text: string; title: string | null };
  };
  escrow: null | { status: string; amount: string; deliveryDeadline: number; buyer: string };
  actions: {
    confirmDelivery?: { via: "smart" | "wallet" };
    raiseDispute?: { via: "smart" | "wallet" };
    review?: boolean;
    markShipped?: boolean;
    markDelivered?: boolean;
    sellerRefund?: boolean;
    refundExpiredIntent?: { intentId: string; chainId: number };
    payNow?: { paymentIntentId: string };
  };
}

export function OrderView({ orderId }: { orderId: string }) {
  return (
    <RequireAuth title="Sign in to view this order">
      {() => <Inner orderId={orderId} />}
    </RequireAuth>
  );
}

function Inner({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<OrderResp>(`/api/orders/${orderId}`),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      const busy =
        d.order.status === "PENDING_PAYMENT" &&
        d.order.paymentIntents.some((i) => i.onchainIntentId && i.status !== "FAILED");
      return busy ? 2_500 : false;
    },
  });
  const exec = useExecuteCalls();
  const gasless = useGasless();
  const [dialog, setDialog] = useState<null | "dispute" | "review" | "ship">(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["order", orderId] });

  const walletAction = useMutation({
    mutationFn: async (body: { action: string; reason?: string }) => {
      const res = await api<{ calls: TxCall[] }>(`/api/orders/${orderId}/tx`, { body });
      await exec.run(res.calls);
    },
    onSuccess: () => {
      toast.success("Transaction confirmed");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const gaslessAction = useMutation({
    mutationFn: (a: { action: "confirmDelivery" } | { action: "raiseDispute"; reason: string }) =>
      gasless.run({ ...a, orderId } as never),
    onSuccess: () => {
      toast.success("Done — gas was sponsored by the Trestle paymaster");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isLoading) {
    return (
      <Container aria-busy="true">
        <Skeleton className="mb-4 h-9 w-72" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </Container>
    );
  }
  if (q.isError || !q.data)
    return (
      <Container>
        <ErrorState
          title="Order unavailable"
          message={errorMessage(q.error)}
          retry={() => q.refetch()}
        />
      </Container>
    );
  const { order, escrow, actions, viewer, tokens } = q.data;
  const fmt = (chainId: number, token: string, amount: string, max = 8) => {
    const t = tokens[`${chainId}:${token.toLowerCase()}`];
    return t ? `${tokenAmount(amount, t.decimals, max)} ${t.symbol}` : `${amount} (raw units)`;
  };
  const intent = order.paymentIntents.at(-1);
  const busy = walletAction.isPending || gaslessAction.isPending;

  return (
    <Container>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link
              href={viewer === "seller" ? "/seller/orders" : "/account"}
              className="hover:underline"
            >
              ← {viewer === "seller" ? "Seller orders" : "Your orders"}
            </Link>
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">
            Order <span className="font-mono text-lg">{order.id.slice(0, 14)}</span>
            <OrderStatusBadge status={order.status} />
            {order.isSeedDemo && <SeedDemoBadge />}
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed {dateTime(order.createdAt)} · sold by {order.seller.storefrontName}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Escrow and payment-intent state, sourced from on-chain events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline order={order} intent={intent} />
            </CardContent>
          </Card>

          {intent && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Payment route</CardTitle>
                  <CardDescription>
                    {intent.routeKind === "CROSS_CHAIN"
                      ? "Cross-chain intent · attested relay"
                      : "Direct payment into escrow"}{" "}
                    · security {intent.securityScore}/100
                  </CardDescription>
                </div>
                <IntentStatusBadge status={intent.status} />
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                  <ChainBadge chainId={intent.sourceChainId} />
                  <span aria-hidden>→</span>
                  <span className="sr-only">to</span>
                  <ChainBadge chainId={intent.destChainId} />
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd className="tabular">
                      {fmt(intent.sourceChainId, intent.sourceToken, intent.sourceAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Seller escrow</dt>
                    <dd className="tabular">
                      {fmt(intent.destChainId, intent.destToken, intent.destAmount, 6)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Source tx</dt>
                    <dd>
                      <TxLink chainId={intent.sourceChainId} hash={intent.sourceTxHash} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Fulfilment tx</dt>
                    <dd>
                      <TxLink chainId={intent.destChainId} hash={intent.fulfillTxHash} />
                    </dd>
                  </div>
                  {intent.routeKind === "CROSS_CHAIN" && (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Settlement proof</dt>
                        <dd>
                          <TxLink chainId={intent.sourceChainId} hash={intent.settleTxHash} />
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Intent id</dt>
                        <dd className="font-mono text-xs">
                          {intent.onchainIntentId ? shortAddress(intent.onchainIntentId, 6) : "—"}
                        </dd>
                      </div>
                    </>
                  )}
                  {intent.failTxHash && (
                    <div className="flex justify-between gap-2 sm:col-span-2">
                      <dt className="text-danger">Refunded</dt>
                      <dd className="text-right text-xs">
                        {intent.failureReason}{" "}
                        <TxLink chainId={intent.sourceChainId} hash={intent.failTxHash} />
                      </dd>
                    </div>
                  )}
                </dl>
                {intent.lastError && intent.status !== "FAILED" && (
                  <Notice tone="warning" className="mt-3">
                    Relayer retrying: {intent.lastError}
                  </Notice>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {order.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i.product.images[0]}
                      alt=""
                      className="size-14 rounded-lg border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${i.product.id}`}
                        className="font-medium hover:underline"
                      >
                        {i.titleSnapshot}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {i.variantSnapshot} × {i.quantity}
                      </p>
                    </div>
                    <span className="tabular">
                      {usd(BigInt(i.unitPriceUsdMicros) * BigInt(i.quantity))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-border pt-3 font-semibold">
                <span>Subtotal</span>
                <span className="tabular">{usd(order.subtotalUsdMicros)}</span>
              </div>
            </CardContent>
          </Card>

          {order.dispute && (
            <Card className={cn(order.dispute.status === "OPEN" && "border-danger/40")}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Gavel className="size-4" aria-hidden /> Dispute
                  </CardTitle>
                  <CardDescription>
                    Raised by {shortAddress(order.dispute.raisedByAddress)} ·{" "}
                    {dateTime(order.dispute.createdAt)}
                  </CardDescription>
                </div>
                <Badge tone={order.dispute.status === "OPEN" ? "danger" : "success"}>
                  {order.dispute.status === "OPEN"
                    ? order.dispute.raiseTxHash
                      ? "Open · funds frozen"
                      : "Awaiting on-chain confirmation"
                    : "Resolved"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{order.dispute.reason}</p>
                {order.dispute.evidence && (
                  <p className="text-muted-foreground">Evidence: {order.dispute.evidence}</p>
                )}
                {order.dispute.status === "RESOLVED" && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="font-medium">
                      Outcome:{" "}
                      {order.dispute.buyerShareBps === 10_000
                        ? "full refund to buyer"
                        : order.dispute.buyerShareBps === 0
                          ? "released to seller"
                          : `${(order.dispute.buyerShareBps ?? 0) / 100}% refunded to buyer, rest to seller`}
                    </p>
                    {order.dispute.resolutionNotes && (
                      <p className="mt-1 text-muted-foreground">{order.dispute.resolutionNotes}</p>
                    )}
                    <p className="mt-1 text-xs">
                      Resolution tx:{" "}
                      <TxLink chainId={order.escrowChainId} hash={order.dispute.resolveTxHash} />
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Escrow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.isSeedDemo ? (
                <p className="text-muted-foreground">
                  This is a seeded demo record without an on-chain escrow.
                </p>
              ) : escrow ? (
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">On-chain status</dt>
                    <dd>
                      <Badge
                        tone={
                          escrow.status === "Created"
                            ? "primary"
                            : escrow.status === "Disputed"
                              ? "danger"
                              : "success"
                        }
                      >
                        {escrow.status}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Chain</dt>
                    <dd>
                      <ChainBadge chainId={order.escrowChainId} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Escrow id</dt>
                    <dd className="font-mono">#{order.escrowContractOrderId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Buyer account</dt>
                    <dd>
                      <AddressLink chainId={order.escrowChainId} address={escrow.buyer} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Auto-release after</dt>
                    <dd>{dateTime(new Date(escrow.deliveryDeadline * 1000))}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-muted-foreground">
                  {order.status === "PENDING_PAYMENT"
                    ? "Escrow is funded once your payment settles."
                    : "Escrow details unavailable (chain unreachable)."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {actions.payNow && (
                <Button
                  className="w-full"
                  loading={busy}
                  onClick={() => walletAction.mutate({ action: "pay" })}
                >
                  Complete payment
                </Button>
              )}
              {actions.confirmDelivery && (
                <Button
                  className="w-full"
                  loading={busy}
                  onClick={() =>
                    actions.confirmDelivery!.via === "smart"
                      ? gaslessAction.mutate({ action: "confirmDelivery" })
                      : walletAction.mutate({ action: "confirmDelivery" })
                  }
                >
                  <PackageCheck /> Confirm delivery &amp; release funds
                </Button>
              )}
              {actions.raiseDispute && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setDialog("dispute")}
                >
                  <Gavel /> Open a dispute
                </Button>
              )}
              {(actions.confirmDelivery?.via === "smart" ||
                actions.raiseDispute?.via === "smart") && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Fuel className="size-3.5" aria-hidden /> Gasless via your ERC-4337 smart account
                  — you only sign a message.
                </p>
              )}
              {actions.review && (
                <Button variant="outline" className="w-full" onClick={() => setDialog("review")}>
                  <Star /> Write a review
                </Button>
              )}
              {actions.markShipped && (
                <Button className="w-full" onClick={() => setDialog("ship")}>
                  <Truck /> Mark as shipped
                </Button>
              )}
              {actions.markDelivered && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await api(`/api/orders/${orderId}/fulfillment`, {
                        body: { action: "deliver" },
                      });
                      toast.success("Marked as delivered — the buyer can now confirm");
                      refresh();
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <PackageCheck /> Carrier reports delivered
                </Button>
              )}
              {viewer === "seller" && order.status === "COMPLETED" && !order.isSeedDemo && (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy}
                  onClick={async () => {
                    try {
                      const res = await api<{ calls: TxCall[] }>("/api/certificates/transfer", {
                        body: { orderId },
                      });
                      await exec.run(res.calls);
                      toast.success("Certificate transferred — provenance updated on-chain");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <ShieldCheck /> Transfer certificate to buyer
                </Button>
              )}
              {actions.sellerRefund && (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy}
                  onClick={() => walletAction.mutate({ action: "sellerRefund" })}
                >
                  <Undo2 /> Refund buyer in full
                </Button>
              )}
              {actions.refundExpiredIntent && (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy}
                  onClick={() => walletAction.mutate({ action: "refundExpired" })}
                >
                  <Undo2 /> Reclaim expired payment
                </Button>
              )}
              {Object.keys(actions).length === 0 && (
                <p className="text-sm text-muted-foreground">No actions available right now.</p>
              )}
              {exec.steps.length > 0 && (
                <div className="pt-2">
                  <TxSteps steps={exec.steps} />
                </div>
              )}
              {gasless.busy && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {gasless.state === "signing"
                    ? "Sign the message in your wallet…"
                    : gasless.state === "bundling"
                      ? "Submitting sponsored UserOperation…"
                      : "Preparing…"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {order.shippingAddress ? (
                <address className="not-italic text-muted-foreground">
                  {order.shippingAddress.name}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
                  <br />
                  {order.shippingAddress.city} {order.shippingAddress.postalCode},{" "}
                  {order.shippingAddress.country}
                </address>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
              {order.trackingNumber && (
                <p className="pt-2">
                  Tracking: <span className="font-mono">{order.trackingNumber}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <DisputeDialog
        open={dialog === "dispute"}
        onClose={() => setDialog(null)}
        orderId={orderId}
        via={actions.raiseDispute?.via}
        onDone={refresh}
        runWallet={exec.run}
        runGasless={(reason) => gasless.run({ action: "raiseDispute", orderId, reason })}
      />
      <ReviewDialog
        open={dialog === "review"}
        onClose={() => setDialog(null)}
        orderId={orderId}
        onDone={refresh}
      />
      <ShipDialog
        open={dialog === "ship"}
        onClose={() => setDialog(null)}
        orderId={orderId}
        onDone={refresh}
      />
    </Container>
  );
}

function Timeline({ order, intent }: { order: OrderResp["order"]; intent?: Intent }) {
  type Row = {
    label: string;
    at?: string | null;
    done: boolean;
    tone?: "danger" | "success";
    chainId?: number | null;
    txHash?: string | null;
    note?: string;
  };
  const rows: Row[] = [{ label: "Order placed", at: order.createdAt, done: true }];
  const tl = intent?.txHashes ?? [];
  const find = (s: string) => tl.find((e) => e.status === s);
  if (intent?.routeKind === "CROSS_CHAIN") {
    rows.push({
      label: "Intent created on source chain",
      done: !!find("CREATED"),
      at: find("CREATED")?.at,
      chainId: intent.sourceChainId,
      txHash: find("CREATED")?.txHash,
    });
    rows.push({
      label: "Routing — relayer attestation",
      done: !!find("ROUTING") || !!find("FULFILLED"),
      at: find("ROUTING")?.at,
      note: find("ROUTING")?.note,
    });
    rows.push({
      label: "Fulfilled — escrow funded by solver liquidity",
      done: !!find("FULFILLED"),
      at: find("FULFILLED")?.at,
      chainId: intent.destChainId,
      txHash: find("FULFILLED")?.txHash,
    });
    if (find("SETTLED"))
      rows.push({
        label: "Solver repaid on source (settlement proof)",
        done: true,
        at: find("SETTLED")?.at,
        chainId: intent.sourceChainId,
        txHash: find("SETTLED")?.txHash,
      });
  } else if (intent) {
    rows.push({
      label: "Paid directly into escrow",
      done: !!find("FULFILLED") || !["PENDING_PAYMENT", "CANCELLED"].includes(order.status),
      at: find("FULFILLED")?.at,
      chainId: intent.destChainId,
      txHash: find("FULFILLED")?.txHash ?? intent.sourceTxHash,
    });
  }
  if (find("FAILED"))
    rows.push({
      label: "Payment refunded",
      done: true,
      tone: "danger",
      at: find("FAILED")?.at,
      chainId: intent?.sourceChainId,
      txHash: find("FAILED")?.txHash,
      note: find("FAILED")?.note,
    });
  const rank = [
    "PENDING_PAYMENT",
    "ESCROWED",
    "SHIPPED",
    "DELIVERED",
    "DISPUTED",
    "COMPLETED",
    "REFUNDED",
  ];
  const r = rank.indexOf(order.status);
  if (order.status !== "CANCELLED" && !find("FAILED")) {
    const passedShipping = r >= 2 && order.status !== "DISPUTED";
    rows.push({
      label: "Shipped",
      done: !!order.shippedAt,
      at: order.shippedAt,
      note: order.trackingNumber
        ? `tracking ${order.trackingNumber}`
        : passedShipping
          ? "no shipment recorded by the seller"
          : undefined,
    });
    if (order.dispute) {
      rows.push({
        label: "Dispute raised — funds frozen",
        done: !!order.dispute.raiseTxHash,
        tone: "danger",
        at: order.dispute.createdAt,
        chainId: order.escrowChainId,
        txHash: order.dispute.raiseTxHash,
      });
      if (order.dispute.status === "RESOLVED")
        rows.push({
          label: `Arbitration: ${(order.dispute.buyerShareBps ?? 0) / 100}% to buyer`,
          done: true,
          at: order.dispute.resolvedAt,
          chainId: order.escrowChainId,
          txHash: order.dispute.resolveTxHash,
        });
    } else {
      rows.push({ label: "Delivered", done: r >= 3 && order.status !== "REFUNDED" });
    }
    rows.push({
      label: order.status === "REFUNDED" ? "Refunded to buyer" : "Funds released to seller",
      done: ["COMPLETED", "REFUNDED"].includes(order.status),
      tone: "success",
      at: order.completedAt,
    });
  } else if (order.status === "CANCELLED") {
    rows.push({ label: "Cancelled — stock released", done: true, tone: "danger" });
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {rows.map((row, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute -left-[31px] top-0.5 grid size-5 place-items-center rounded-full bg-card",
              row.done
                ? row.tone === "danger"
                  ? "text-danger"
                  : "text-success"
                : "text-muted-foreground",
            )}
            aria-hidden
          >
            {row.done ? (
              row.tone === "danger" ? (
                <XCircle className="size-5" />
              ) : (
                <CheckCircle2 className="size-5" />
              )
            ) : (
              <CircleDot className="size-5" />
            )}
          </span>
          <p className={cn("text-sm", row.done ? "font-medium" : "text-muted-foreground")}>
            {row.label}
            <span className="sr-only">{row.done ? " — done" : " — pending"}</span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {row.at && <span>{dateTime(row.at)}</span>}
            {row.chainId && row.txHash && (
              <>
                <ChainBadge chainId={row.chainId} />
                <TxLink chainId={row.chainId} hash={row.txHash} />
              </>
            )}
            {row.note && <span>{row.note}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

function DisputeDialog({
  open,
  onClose,
  orderId,
  via,
  onDone,
  runWallet,
  runGasless,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  via?: "smart" | "wallet";
  onDone: () => void;
  runWallet: (calls: TxCall[]) => Promise<unknown>;
  runGasless: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const res = await api<{ via: "smart" | "wallet"; calls?: TxCall[] }>("/api/disputes", {
        body: { orderId, reason, evidence: evidence || undefined },
      });
      if (res.via === "smart") await runGasless(reason);
      else await runWallet(res.calls!);
    },
    onSuccess: () => {
      toast.success("Dispute opened — escrow is frozen until an arbiter decides");
      onClose();
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Open a dispute"
        description="Funds are frozen on-chain until a Trestle arbiter resolves the case (full refund, split or release)."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 10) m.mutate();
          }}
        >
          <Field
            label="What went wrong?"
            htmlFor="d-reason"
            hint="At least 10 characters. This is written on-chain."
            error={
              reason && reason.trim().length < 10 ? "Please add a little more detail" : undefined
            }
          >
            <Textarea
              id="d-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              required
            />
          </Field>
          <Field
            label="Evidence (optional, private)"
            htmlFor="d-evidence"
            hint="Links to photos, carrier notes… stored off-chain for the arbiter."
          >
            <Textarea
              id="d-evidence"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              maxLength={2000}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={m.isPending}
              disabled={reason.trim().length < 10}
            >
              {via === "smart" ? "Sign & open dispute (gasless)" : "Open dispute"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  open,
  onClose,
  orderId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/review`, { body: { rating, title: title || undefined, text } }),
    onSuccess: () => {
      toast.success("Thanks for your review");
      onClose();
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Review your purchase"
        description="Reviews are tied to this completed order and marked as verified purchases."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Rating</legend>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onClick={() => setRating(n)}
                  className="rounded p-1"
                >
                  <Star
                    className={cn(
                      "size-6",
                      n <= rating ? "fill-accent text-accent" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Title (optional)" htmlFor="r-title">
            <Input
              id="r-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Your review" htmlFor="r-text" hint="At least 10 characters">
            <Textarea
              id="r-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              minLength={10}
              maxLength={2000}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={text.trim().length < 10}>
              Publish review
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShipDialog({
  open,
  onClose,
  orderId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  onDone: () => void;
}) {
  const [tracking, setTracking] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/fulfillment`, {
        body: { action: "ship", trackingNumber: tracking },
      }),
    onSuccess: () => {
      toast.success("Marked as shipped");
      onClose();
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Mark as shipped"
        description="The buyer sees the tracking number. Funds stay in escrow until delivery is confirmed."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Tracking number" htmlFor="t-num">
            <Input
              id="t-num"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              required
              minLength={4}
              maxLength={60}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={tracking.trim().length < 4}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
