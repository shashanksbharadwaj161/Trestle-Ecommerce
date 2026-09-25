"use client";
import Link from "@/components/link";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCents } from "@trestle/shared";
import { RequireAuth } from "@/components/require-auth";
import { Container, ErrorState, Notice, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { CardPaymentBadge, OrderStatusBadge, ReturnStatusBadge } from "@/components/status-badge";
import { Price } from "@/components/price";
import { api, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";

interface Detail {
  order: {
    id: string;
    status: string;
    paymentMethod: "CARD" | "CRYPTO";
    createdAt: string;
    subtotalUsdMicros: string;
    trackingNumber: string | null;
    carrier: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    shippingAddress: Record<string, string> | null;
    seller: { storefrontName: string };
    buyer: { displayName: string | null; email: string | null } | null;
    items: {
      id: string;
      titleSnapshot: string;
      variantSnapshot: string;
      quantity: number;
      unitPriceUsdMicros: string;
    }[];
    cardPayment: {
      id: string;
      status: string;
      email: string | null;
      totalCents: number;
      refundedCents: number;
      shippingCents: number;
      discountCents: number;
      shippingMethod: string;
      shippingAddress: Record<string, string> | null;
      stripePaymentIntentId: string | null;
      failureReason: string | null;
    } | null;
    returnRequests: { id: string; status: string; reason: string; createdAt: string }[];
  };
}

export default function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireAuth role="ADMIN">{() => <Inner id={id} />}</RequireAuth>;
}

function Inner({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => api<Detail>(`/api/admin/orders/${id}`),
  });
  const [carrier, setCarrier] = useState("UPS");
  const [tracking, setTracking] = useState("");
  const [refund, setRefund] = useState("");
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["admin-order", id] });
  };
  const fulfil = useMutation({
    mutationFn: (body: object) => api(`/api/orders/${id}/fulfillment`, { body }),
    onSuccess: () => done("Order updated"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const act = useMutation({
    mutationFn: (body: object) => api(`/api/admin/orders/${id}`, { body }),
    onSuccess: () => done("Done — the refund is confirmed by Stripe’s webhook"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading)
    return (
      <Container>
        <Skeleton className="h-96" />
      </Container>
    );
  if (q.isError)
    return (
      <Container>
        <ErrorState message={errorMessage(q.error)} />
      </Container>
    );
  const o = q.data!.order;
  const p = o.cardPayment;
  const addr = p?.shippingAddress ?? o.shippingAddress;
  return (
    <Container className="max-w-5xl">
      <Link href="/admin/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← Orders
      </Link>
      <PageHeader
        title={`Order ${o.id}`}
        description={`${o.seller.storefrontName} · ${dateTime(o.createdAt)} · ${o.paymentMethod === "CARD" ? "Card" : "Stablecoin escrow"}`}
        actions={<OrderStatusBadge status={o.status} />}
      />
      {o.paymentMethod === "CRYPTO" && (
        <Notice tone="info" className="mb-8">
          Stablecoin order: funds are governed by the escrow contract. Use{" "}
          <Link href={`/orders/${o.id}`} className="underline">
            the order page
          </Link>{" "}
          and{" "}
          <Link href="/admin/disputes" className="underline">
            escrow disputes
          </Link>
          .
        </Notice>
      )}
      <div className="grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="text-[0.9375rem] font-medium">Items</h2>
          <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-3">
                <span>
                  {i.titleSnapshot}{" "}
                  <span className="text-muted-foreground">
                    · {i.variantSnapshot} ×{i.quantity}
                  </span>
                </span>
                <Price micros={(BigInt(i.unitPriceUsdMicros) * BigInt(i.quantity)).toString()} />
              </li>
            ))}
          </ul>
          <h2 className="mt-8 text-[0.9375rem] font-medium">Ship to</h2>
          {addr ? (
            <address className="mt-2 text-sm not-italic text-muted-foreground">
              {Object.values(addr)
                .filter(Boolean)
                .map((l, i) => (
                  <span key={i} className="block">
                    {l}
                  </span>
                ))}
            </address>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No address yet.</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">{o.buyer?.email ?? p?.email ?? ""}</p>
        </section>
        <section className="space-y-8">
          {p && (
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[0.9375rem] font-medium">Card payment</h2>
                <CardPaymentBadge status={p.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="tabular">{formatCents(p.totalCents)}</dd>
                <dt className="text-muted-foreground">Refunded</dt>
                <dd className="tabular">{formatCents(p.refundedCents)}</dd>
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="capitalize">{p.shippingMethod}</dd>
                <dt className="text-muted-foreground">Stripe PaymentIntent</dt>
                <dd className="truncate font-mono text-xs">{p.stripePaymentIntentId ?? "—"}</dd>
              </dl>
              {p.failureReason && <p className="mt-2 text-sm text-danger">{p.failureReason}</p>}
            </div>
          )}
          {(o.status === "PROCESSING" || o.status === "ESCROWED") && (
            <form
              className="space-y-3 border border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                fulfil.mutate({ action: "ship", carrier, trackingNumber: tracking });
              }}
            >
              <h3 className="text-sm font-medium">Mark as shipped</h3>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <Select
                  aria-label="Carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="h-10"
                >
                  {["UPS", "USPS", "FEDEX", "DHL", "OTHER"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Input
                  aria-label="Tracking number"
                  placeholder="Tracking number"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  className="h-10"
                  required
                  minLength={4}
                />
              </div>
              <Button type="submit" size="sm" loading={fulfil.isPending}>
                Mark shipped
              </Button>
            </form>
          )}
          {o.status === "SHIPPED" && (
            <div className="border border-border p-4">
              <p className="text-sm">
                Shipped {o.shippedAt ? dateTime(o.shippedAt) : ""} · {o.carrier} {o.trackingNumber}
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => fulfil.mutate({ action: "deliver" })}
                loading={fulfil.isPending}
              >
                Mark delivered
              </Button>
            </div>
          )}
          {p && o.status === "PROCESSING" && (
            <div className="border border-border p-4">
              <h3 className="text-sm font-medium">Cancel & refund</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Refunds this order’s share of the payment and returns the items to stock.
              </p>
              <Button
                size="sm"
                variant="danger"
                className="mt-3"
                loading={act.isPending}
                onClick={() =>
                  confirm("Cancel this order and refund it?") && act.mutate({ action: "cancel" })
                }
              >
                Cancel order
              </Button>
            </div>
          )}
          {p && (p.status === "PAID" || p.status === "PARTIALLY_REFUNDED") && (
            <form
              className="space-y-3 border border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const cents = Math.round(Number(refund) * 100);
                if (!Number.isFinite(cents) || cents <= 0) return toast.error("Enter an amount");
                act.mutate({ action: "refund", amountCents: cents });
              }}
            >
              <h3 className="text-sm font-medium">Partial refund</h3>
              <Field
                label={`Amount (USD, max ${formatCents(p.totalCents - p.refundedCents)})`}
                htmlFor="refund"
              >
                <Input
                  id="refund"
                  inputMode="decimal"
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                  className="h-10"
                />
              </Field>
              <Button type="submit" size="sm" variant="outline" loading={act.isPending}>
                Issue refund
              </Button>
            </form>
          )}
          {o.returnRequests.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Returns</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {o.returnRequests.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <ReturnStatusBadge status={r.status} /> {r.reason}
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/returns"
                className="mt-2 inline-block text-sm underline underline-offset-4"
              >
                Manage returns
              </Link>
            </div>
          )}
        </section>
      </div>
    </Container>
  );
}
