"use client";
import Image from "next/image";
import Link from "@/components/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { formatCents, RETURN_REASONS } from "@trestle/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, Select, Textarea } from "@/components/ui/input";
import { CardPaymentBadge, OrderStatusBadge, ReturnStatusBadge } from "./status-badge";
import { Price } from "./price";
import { ErrorState, Notice } from "./states";

interface OrderItem {
  id: string;
  titleSnapshot: string;
  variantSnapshot: string;
  imageSnapshot: string | null;
  quantity: number;
  unitPriceUsdMicros: string;
  product: { slug: string | null };
}
interface CardOrder {
  id: string;
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  seller: { storefrontName: string };
  items: OrderItem[];
  returnRequests: {
    id: string;
    status: string;
    reason: string;
    createdAt: string;
    refundCents: number | null;
  }[];
}
interface CardView {
  viewer: "owner" | "guest" | "admin" | "seller";
  privateLink: string | null;
  canClaim: boolean;
  eligibility: Record<string, { eligible: boolean; reason: string | null; deadline?: string }>;
  payment: {
    id: string;
    status: string;
    email: string | null;
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    totalCents: number;
    refundedCents: number;
    promoCode: string | null;
    shippingMethod: string;
    shippingAddress: Record<string, string | null> | null;
    failureReason: string | null;
    createdAt: string;
    paidAt: string | null;
    orders: CardOrder[];
  };
}

const CARRIER_URL: Record<string, (n: string) => string> = {
  UPS: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  FEDEX: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  DHL: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
};

export function CardOrderView({
  paymentId,
  context,
}: {
  paymentId: string;
  context: "complete" | "status";
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["card-payment", paymentId],
    queryFn: () => api<CardView>(`/api/checkout/card/${paymentId}`),
    retry: (n, err) => !(err instanceof ApiClientError && err.status === 404) && n < 2,
    // poll while we wait for Stripe's signed webhook to confirm the payment
    refetchInterval: (query) => {
      const s = query.state.data?.payment.status;
      return s === "OPEN" || s === "PROCESSING" ? 3000 : false;
    },
  });
  const claim = useMutation({
    mutationFn: () => api(`/api/checkout/card/${paymentId}/claim`, { body: {} }),
    onSuccess: () => {
      toast.success("Order saved to your account");
      qc.invalidateQueries({ queryKey: ["card-payment", paymentId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError) {
    if (q.error instanceof ApiClientError && q.error.status === 404)
      return (
        <div className="border-y border-border py-16 text-center">
          <p className="text-lg">We can’t show this order</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Open it from the private link on your confirmation page, or sign in to the account you
            ordered with.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      );
    return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;
  }
  const v = q.data!;
  const p = v.payment;
  const waiting = p.status === "OPEN";

  return (
    <div className="space-y-10">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <CardPaymentBadge status={p.status} />
          <span className="tabular text-[0.8125rem] text-muted-foreground">
            Order {p.id.slice(-10).toUpperCase()}
          </span>
        </div>
        <h1 className="mt-4 text-[1.75rem] leading-tight tracking-[-0.02em] md:text-[2.25rem]">
          {p.status === "PAID" || p.status === "PARTIALLY_REFUNDED"
            ? context === "complete"
              ? "Thank you — your order is confirmed"
              : "Your order"
            : p.status === "PROCESSING"
              ? "Your payment is processing"
              : p.status === "OPEN"
                ? "Confirming your payment…"
                : p.status === "REFUNDED"
                  ? "This order was refunded"
                  : p.status === "FAILED"
                    ? "Your payment didn’t go through"
                    : "This checkout has expired"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {waiting
            ? "We’re waiting for Stripe to confirm the payment. This page updates automatically — it usually takes a few seconds. Nothing is confirmed until then."
            : p.status === "PROCESSING"
              ? "Your bank is processing the payment. We’ll hold your items and confirm the order as soon as it clears."
              : p.status === "FAILED" || p.status === "EXPIRED"
                ? "No payment was taken and the items were released. Your bag still has them if you’d like to try again."
                : p.failureReason
                  ? p.failureReason
                  : p.email
                    ? `We’ll use ${p.email} if we need to reach you about this order.`
                    : null}
        </p>
        {waiting && (
          <p className="mt-4 flex items-center gap-2 text-sm" role="status">
            <Loader2 className="size-4 animate-spin" /> Waiting for confirmation
          </p>
        )}
        {(p.status === "FAILED" || p.status === "EXPIRED") && (
          <Button asChild className="mt-6">
            <Link href="/checkout">Return to checkout</Link>
          </Button>
        )}
      </header>

      {v.privateLink &&
        (p.status === "PAID" || p.status === "PROCESSING" || p.status === "PARTIALLY_REFUNDED") && (
          <PrivateLink link={v.privateLink} />
        )}
      {v.canClaim && (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              You’re signed in. Save this guest order to your account to see it in your order
              history.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => claim.mutate()}
              loading={claim.isPending}
            >
              Save to my account
            </Button>
          </div>
        </Notice>
      )}

      {p.orders.map((o) => (
        <section
          key={o.id}
          aria-label={`Items from ${o.seller.storefrontName}`}
          className="border-t border-border pt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {o.seller.storefrontName}{" "}
              <span className="text-muted-foreground">
                · {o.items.length} item{o.items.length === 1 ? "" : "s"}
              </span>
            </p>
            <OrderStatusBadge status={o.status} />
          </div>
          <ul className="mt-4 space-y-4">
            {o.items.map((it) => (
              <li key={it.id} className="flex gap-4">
                <Link
                  href={`/products/${it.product.slug ?? ""}`}
                  className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-muted"
                >
                  {it.imageSnapshot && (
                    <Image
                      src={it.imageSnapshot}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  )}
                </Link>
                <div className="flex-1 text-sm">
                  <p>{it.titleSnapshot}</p>
                  <p className="text-muted-foreground">{it.variantSnapshot}</p>
                  <p className="text-muted-foreground">Qty {it.quantity}</p>
                </div>
                <Price
                  micros={(BigInt(it.unitPriceUsdMicros) * BigInt(it.quantity)).toString()}
                  className="text-sm"
                />
              </li>
            ))}
          </ul>
          <Timeline o={o} />
          {o.returnRequests.length > 0 && (
            <ul className="mt-4 space-y-2">
              {o.returnRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <ReturnStatusBadge status={r.status} />
                  <span className="text-muted-foreground">
                    {r.reason} · requested {dateTime(r.createdAt)}
                    {r.refundCents ? ` · ${formatCents(r.refundCents)} refunded` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(v.viewer === "owner" || v.viewer === "guest") && (
            <ReturnAction order={o} eligibility={v.eligibility[o.id]} paymentId={paymentId} />
          )}
        </section>
      ))}

      <section
        aria-label="Payment summary"
        className="grid gap-8 border-t border-border pt-6 md:grid-cols-2"
      >
        <div className="text-sm">
          <h2 className="font-medium">Delivery address</h2>
          {p.shippingAddress ? (
            <address className="mt-2 not-italic text-muted-foreground">
              {[
                p.shippingAddress.name,
                p.shippingAddress.line1,
                p.shippingAddress.line2,
                [p.shippingAddress.postalCode, p.shippingAddress.city].filter(Boolean).join(" "),
                p.shippingAddress.state,
                p.shippingAddress.country,
              ]
                .filter(Boolean)
                .map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
            </address>
          ) : (
            <p className="mt-2 text-muted-foreground">Shown once the payment is confirmed.</p>
          )}
          <p className="mt-4 text-muted-foreground capitalize">{p.shippingMethod} delivery</p>
        </div>
        <dl className="space-y-2 text-sm">
          <Row k="Subtotal" v={formatCents(p.subtotalCents)} />
          {p.discountCents > 0 && (
            <Row
              k={`Discount${p.promoCode ? ` (${p.promoCode})` : ""}`}
              v={`−${formatCents(p.discountCents)}`}
            />
          )}
          <Row k="Delivery" v={p.shippingCents ? formatCents(p.shippingCents) : "Free"} />
          <div className="flex justify-between border-t border-border pt-2 font-medium">
            <dt>Total</dt>
            <dd className="tabular">{formatCents(p.totalCents)}</dd>
          </div>
          {p.refundedCents > 0 && <Row k="Refunded" v={`−${formatCents(p.refundedCents)}`} />}
          <p className="pt-2 text-xs text-muted-foreground">
            Paid by card via Stripe{p.paidAt ? ` · ${dateTime(p.paidAt)}` : ""}
          </p>
        </dl>
      </section>
      <p className="text-sm text-muted-foreground">
        Questions about this order?{" "}
        <Link
          href={`/contact?order=${p.id}`}
          className="text-foreground underline underline-offset-4"
        >
          Contact us
        </Link>
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}

function Timeline({ o }: { o: CardOrder }) {
  const steps = [
    { label: "Order placed", done: o.status !== "PENDING_PAYMENT" && o.status !== "CANCELLED" },
    { label: "Shipped", done: !!o.shippedAt, at: o.shippedAt },
    { label: "Delivered", done: !!o.deliveredAt || o.status === "DELIVERED", at: o.deliveredAt },
  ];
  if (o.status === "CANCELLED" || o.status === "REFUNDED") return null;
  const trackUrl =
    o.trackingUrl ??
    (o.carrier && o.trackingNumber ? CARRIER_URL[o.carrier]?.(o.trackingNumber) : undefined);
  return (
    <div className="mt-6">
      <ol className="grid grid-cols-3 gap-2" aria-label="Delivery progress">
        {steps.map((s) => (
          <li key={s.label} className="text-[0.8125rem]">
            <div className={`h-[2px] ${s.done ? "bg-foreground" : "bg-border"}`} />
            <p className={`mt-2 ${s.done ? "" : "text-muted-foreground"}`}>{s.label}</p>
            {s.at && <p className="text-xs text-muted-foreground">{dateTime(s.at)}</p>}
          </li>
        ))}
      </ol>
      {o.trackingNumber && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Package className="size-4" strokeWidth={1.5} />
          {o.carrier ?? "Carrier"} · <span className="tabular">{o.trackingNumber}</span>
          {trackUrl && (
            <a
              href={trackUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            >
              Track parcel
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function PrivateLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-border p-5">
      <p className="text-sm font-medium">Save your private order link</p>
      <p className="mt-1 text-[0.8125rem] text-muted-foreground">
        Anyone with this link can see this order, so keep it to yourself. It’s the way back to your
        order, tracking and returns if you checked out as a guest.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={link}
          aria-label="Private order link"
          className="h-10 min-w-0 flex-1 border border-input bg-card px-3 text-xs text-muted-foreground"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-10"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function ReturnAction({
  order,
  eligibility,
  paymentId,
}: {
  order: CardOrder;
  eligibility?: { eligible: boolean; reason: string | null; deadline?: string };
  paymentId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api("/api/returns", {
        body: {
          orderId: order.id,
          reason,
          notes: notes || undefined,
          items: Object.entries(qty)
            .filter(([, n]) => n > 0)
            .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        },
      }),
    onSuccess: () => {
      setOpen(false);
      toast.success("Return requested. We’ll review it and update this page.");
      qc.invalidateQueries({ queryKey: ["card-payment", paymentId] });
    },
  });
  if (!eligibility) return null;
  if (!eligibility.eligible)
    return order.status === "DELIVERED" ? (
      <p className="mt-4 text-[0.8125rem] text-muted-foreground">{eligibility.reason}</p>
    ) : null;
  const selected = Object.values(qty).some((n) => n > 0);
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Request a return
        </Button>
        {eligibility.deadline && (
          <span className="text-xs text-muted-foreground">
            Return window closes {dateTime(eligibility.deadline)}
          </span>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Request a return" description="Choose the items and tell us why.">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <fieldset className="space-y-3">
              <legend className="mb-2 text-[0.8125rem] font-medium">Items</legend>
              {order.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                  <label htmlFor={`rq-${it.id}`} className="flex-1">
                    {it.titleSnapshot}{" "}
                    <span className="text-muted-foreground">· {it.variantSnapshot}</span>
                  </label>
                  <Select
                    id={`rq-${it.id}`}
                    className="h-10 w-20"
                    value={qty[it.id] ?? 0}
                    onChange={(e) => setQty({ ...qty, [it.id]: Number(e.target.value) })}
                  >
                    {Array.from({ length: it.quantity + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </fieldset>
            <Field label="Reason" htmlFor="rq-reason">
              <Select id="rq-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {RETURN_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            <Field label="Anything else? (optional)" htmlFor="rq-notes">
              <Textarea
                id="rq-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
              />
            </Field>
            {m.isError && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(m.error)}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!selected} loading={m.isPending}>
              Submit return request
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
