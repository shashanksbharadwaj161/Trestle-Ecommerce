"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { formatCents } from "@trestle/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Price } from "@/components/price";
import { ErrorState, Notice } from "@/components/states";
import { useCart } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Options {
  card: { enabled: boolean; mode: "test" | "mock" | null; reason: string | null };
  crypto: { enabled: boolean; chains: number[]; reason: string | null };
  shippingMethods: {
    id: "standard" | "express";
    label: string;
    detail: string;
    cents: number;
    freeOverCents: number | null;
  }[];
}
interface Totals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
}
interface QuoteResp {
  totals: Totals;
  promo: { code: string; description: string } | null;
  promoNote: string | null;
  warnings: string[];
}

export function CheckoutView() {
  const hydrated = useHydrated();
  const cart = useCart();
  const { user } = useSession();
  const [method, setMethod] = useState<"card" | "crypto">("card");
  const [shipping, setShipping] = useState<"standard" | "express">("standard");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | undefined>();
  const [promoError, setPromoError] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["checkout-options"],
    queryFn: () => api<Options>("/api/checkout/options"),
  });
  const lineCount = cart.data?.lines.length ?? 0;
  const quote = useQuery({
    queryKey: ["card-quote", shipping, promo, cart.data?.subtotalUsdMicros, lineCount],
    queryFn: () =>
      api<QuoteResp>("/api/checkout/card/quote", {
        body: { shippingMethod: shipping, promoCode: promo },
      }),
    enabled: lineCount > 0,
    retry: false,
  });
  useEffect(() => {
    if (quote.error && promo) {
      setPromoError(errorMessage(quote.error));
      setPromo(undefined);
    }
  }, [quote.error, promo]);
  useEffect(() => {
    if (options.data && !options.data.card.enabled && options.data.crypto.enabled)
      setMethod("crypto");
  }, [options.data]);

  const pay = useMutation({
    mutationFn: () =>
      api<{ url: string; paymentId: string }>("/api/checkout/card", {
        body: { shippingMethod: shipping, promoCode: promo, email: user ? undefined : email },
      }),
    onSuccess: (r) => {
      // hand off to Stripe's hosted page; nothing is marked paid until Stripe's signed webhook arrives
      window.location.assign(r.url);
    },
  });

  function submitCard() {
    if (!user) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      if (!ok) {
        setEmailError("Enter a valid email so we can reach you about your order.");
        document.getElementById("email")?.focus();
        return;
      }
    }
    setEmailError(null);
    pay.mutate();
  }

  if (!hydrated || cart.isLoading) {
    return (
      <div className="container-page grid gap-10 pt-10 md:grid-cols-12">
        <Skeleton className="h-[480px] md:col-span-7" />
        <Skeleton className="h-80 md:col-span-5" />
      </div>
    );
  }
  if (cart.isError) {
    return (
      <div className="container-page pt-10">
        <ErrorState message="We couldn’t load your bag." retry={() => cart.refetch()} />
      </div>
    );
  }
  if (!cart.data || cart.data.lines.length === 0) {
    return (
      <div className="container-page pt-10">
        <div className="border-y border-border py-20 text-center">
          <p className="text-lg">Your bag is empty</p>
          <Link href="/women" className="mt-4 inline-block text-sm underline underline-offset-4">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  const opts = options.data;
  const t = quote.data?.totals;
  const groups = cart.data.groups;

  return (
    <div className="container-page pt-8 md:pt-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[2rem] tracking-[-0.03em] md:text-[2.5rem]">Checkout</h1>
        <Link href="/bag" className="text-sm underline underline-offset-4">
          Edit bag
        </Link>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-12 md:gap-12">
        <div className="space-y-10 md:col-span-7">
          {/* 1. contact */}
          <section aria-labelledby="step-contact">
            <h2 id="step-contact" className="eyebrow text-muted-foreground">
              1 · Contact
            </h2>
            {user ? (
              <p className="mt-3 text-sm">
                Signed in as{" "}
                <span className="font-medium">
                  {user.email ?? user.displayName ?? "your account"}
                </span>
                . Your order will appear in your account.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <Field
                  label="Email"
                  htmlFor="email"
                  error={emailError ?? undefined}
                  hint="For your order confirmation page and any questions about delivery."
                >
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "email-error" : undefined}
                  />
                </Field>
                <p className="text-[0.8125rem] text-muted-foreground">
                  Checking out as a guest.{" "}
                  <Link
                    href="/sign-in?next=/checkout"
                    className="text-foreground underline underline-offset-4"
                  >
                    Sign in
                  </Link>{" "}
                  to save the order to your account.
                </p>
              </div>
            )}
          </section>

          {/* 2. delivery */}
          <section aria-labelledby="step-delivery">
            <h2 id="step-delivery" className="eyebrow text-muted-foreground">
              2 · Delivery
            </h2>
            <div className="mt-4 space-y-2" role="radiogroup" aria-labelledby="step-delivery">
              {(opts?.shippingMethods ?? []).map((m) => {
                const free =
                  m.freeOverCents !== null &&
                  t &&
                  t.subtotalCents - t.discountCents >= m.freeOverCents;
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-4 border px-4 py-4 transition-colors",
                      shipping === m.id
                        ? "border-foreground"
                        : "border-border hover:border-foreground/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="shipping"
                      value={m.id}
                      checked={shipping === m.id}
                      onChange={() => setShipping(m.id)}
                      className="size-4 accent-[var(--foreground)]"
                    />
                    <span className="flex-1">
                      <span className="block text-sm">{m.label}</span>
                      <span className="block text-[0.8125rem] text-muted-foreground">
                        {m.detail}
                      </span>
                    </span>
                    <span className="tabular text-sm">{free ? "Free" : formatCents(m.cents)}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              You’ll enter your delivery address on the secure payment page.
            </p>
          </section>

          {/* 3. payment */}
          <section aria-labelledby="step-payment">
            <h2 id="step-payment" className="eyebrow text-muted-foreground">
              3 · Payment
            </h2>
            <div className="mt-4 space-y-2" role="radiogroup" aria-labelledby="step-payment">
              <PayOption
                checked={method === "card"}
                disabled={!opts?.card.enabled}
                onSelect={() => setMethod("card")}
                icon={<CreditCard className="size-5" strokeWidth={1.5} />}
                title="Card"
                detail={
                  opts?.card.enabled
                    ? "Visa, Mastercard, Amex and wallets on Stripe’s secure checkout. No account needed."
                    : (opts?.card.reason ?? "Checking availability…")
                }
              />
              <PayOption
                checked={method === "crypto"}
                disabled={!opts?.crypto.enabled}
                onSelect={() => setMethod("crypto")}
                icon={<ShieldCheck className="size-5" strokeWidth={1.5} />}
                title="Stablecoin escrow"
                detail={
                  opts?.crypto.enabled
                    ? "Pay from a supported chain. Funds stay in escrow until you confirm delivery. Needs a wallet."
                    : (opts?.crypto.reason ?? "Checking availability…")
                }
              />
            </div>
            {opts?.card.enabled && method === "card" && (
              <Notice tone="warning" className="mt-4">
                {opts.card.mode === "mock"
                  ? "Payments are routed to a local mock of Stripe for automated tests. Nothing is charged."
                  : "Stripe test mode: no real charge is made. Use a Stripe test card such as 4242 4242 4242 4242."}
              </Notice>
            )}
          </section>

          {method === "card" ? (
            <div>
              {pay.isError && (
                <p role="alert" className="mb-3 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {errorMessage(pay.error)}
                </p>
              )}
              <Button
                size="lg"
                className="w-full"
                onClick={submitCard}
                loading={pay.isPending || pay.isSuccess}
                disabled={!opts?.card.enabled || !t || quote.isFetching}
              >
                <Lock className="size-4" strokeWidth={1.5} />
                {t
                  ? `Continue to secure payment · ${formatCents(t.totalCents)}`
                  : "Continue to secure payment"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Your card details are entered on Stripe’s hosted page and never reach Trestle.
              </p>
            </div>
          ) : (
            <div className="border border-border p-5">
              <p className="text-sm">
                Stablecoin escrow pays each label separately, because each order has its own escrow
                contract.
              </p>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {groups.map((g) => (
                  <li key={g.seller.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="text-sm">
                      <p>{g.seller.storefrontName}</p>
                      <p className="text-muted-foreground">
                        {g.lines.length} item{g.lines.length === 1 ? "" : "s"} ·{" "}
                        <Price micros={g.subtotalUsdMicros} />
                      </p>
                    </div>
                    <Button asChild variant="trust" size="sm" aria-disabled={!opts?.crypto.enabled}>
                      <Link href={`/checkout/crypto?seller=${g.seller.id}`}>
                        Pay with stablecoin
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
              <Link
                href="/payments"
                className="mt-4 inline-block text-[0.8125rem] underline underline-offset-4"
              >
                How stablecoin escrow works
              </Link>
            </div>
          )}
        </div>

        {/* summary */}
        <aside aria-label="Order summary" className="md:col-span-5">
          <div className="sticky-under-header bg-muted/60 p-6 md:sticky md:top-[calc(var(--header-offset)+2rem)]">
            <h2 className="text-[0.9375rem] font-medium">
              Order summary <span className="text-muted-foreground">({cart.count})</span>
            </h2>
            <ul className="mt-4 space-y-4">
              {cart.data.lines.map((l) => (
                <li key={l.variantId} className="flex gap-3">
                  <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden bg-muted">
                    {l.image && (
                      <Image src={l.image} alt="" fill sizes="64px" className="object-cover" />
                    )}
                    <span className="tabular absolute right-0 top-0 grid min-w-5 place-items-center bg-foreground px-1 text-[11px] text-background">
                      {l.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 text-[0.8125rem]">
                    <p className="truncate">{l.product.title}</p>
                    <p className="text-muted-foreground">
                      {[l.colour, l.size].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Price micros={l.lineTotalUsdMicros} className="text-[0.8125rem]" />
                </li>
              ))}
            </ul>

            <form
              className="mt-6 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPromoError(null);
                const code = promoInput.trim().toUpperCase();
                setPromo(code || undefined);
              }}
            >
              <label htmlFor="promo" className="sr-only">
                Promo code
              </label>
              <Input
                id="promo"
                placeholder="Promo code"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                className="h-10 bg-background uppercase"
                aria-invalid={!!promoError}
                aria-describedby={promoError ? "promo-error" : undefined}
              />
              <Button type="submit" variant="outline" size="sm" className="h-10">
                Apply
              </Button>
            </form>
            {promoError && (
              <p id="promo-error" role="alert" className="mt-2 text-xs text-danger">
                {promoError}
              </p>
            )}
            {quote.data?.promoNote && (
              <p className="mt-2 text-xs text-muted-foreground">{quote.data.promoNote}</p>
            )}

            <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
              {quote.isLoading || !t ? (
                <>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </>
              ) : (
                <>
                  <Row label="Subtotal" value={formatCents(t.subtotalCents)} />
                  {t.discountCents > 0 && (
                    <Row
                      label={`Discount${quote.data?.promo ? ` (${quote.data.promo.code})` : ""}`}
                      value={`−${formatCents(t.discountCents)}`}
                    />
                  )}
                  <Row
                    label="Delivery"
                    value={t.shippingCents === 0 ? "Free" : formatCents(t.shippingCents)}
                  />
                  <div className="flex justify-between border-t border-border pt-3 text-[0.9375rem] font-medium">
                    <dt>Total</dt>
                    <dd className="tabular">{formatCents(t.totalCents)}</dd>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Prices in USD. Taxes and duties are not calculated in this store.
                  </p>
                </>
              )}
            </dl>
            {quote.data?.warnings.map((w) => (
              <p
                key={w}
                role="status"
                className="mt-3 bg-warning-soft px-3 py-2 text-xs text-warning"
              >
                {w}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function PayOption({
  checked,
  disabled,
  onSelect,
  icon,
  title,
  detail,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-4 border px-4 py-4 transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked && !disabled ? "border-foreground" : "border-border hover:border-foreground/50",
      )}
    >
      <input
        type="radio"
        name="payment"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 size-4 accent-[var(--foreground)]"
      />
      <span className="mt-0.5">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm">{title}</span>
        <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
