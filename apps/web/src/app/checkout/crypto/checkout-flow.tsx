"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fuel,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { ConnectWallet } from "@/components/connect";
import { Container, EmptyState, ErrorState, Notice, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainBadge } from "@/components/chain";
import { TxSteps } from "@/components/tx-steps";
import { useExecuteCalls, type TxCall } from "@/hooks/use-tx";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { duration, tokenAmount, usd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { LiveStatus } from "./live-status";

interface Route {
  key: string;
  available: boolean;
  reason?: string;
  kind?: "direct" | "cross-chain";
  label?: string;
  sourceChainId: number;
  destChainId: number;
  payToken: { address: string; symbol: string; decimals: number; isNative: boolean };
  payoutToken?: { symbol: string; decimals: number };
  sourceAmount?: string;
  destAmount?: string;
  feeAmount?: string;
  effectiveFeeBps?: number;
  solverSpreadUsdMicros?: string;
  estimatedSeconds?: number;
  securityScore?: number;
  securityNotes?: string[];
  steps?: string[];
  liquidity?: { available: string; sufficient: boolean };
}
interface Quote {
  quoteId: string;
  expiresAt: string;
  seller: { id: string; storefrontName: string; payoutChainId: number };
  items: {
    variantId: string;
    quantity: number;
    unitPriceUsdMicros: string;
    title: string;
    variantName: string;
  }[];
  subtotalUsdMicros: string;
  routes: Route[];
  recommendedKey: string | null;
  priceSource: string;
}

const STEPS = ["Shipping", "Pay with", "Review & sign", "Settlement"] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Checkout progress">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? "step" : undefined}
          className="flex flex-col gap-1.5"
        >
          <span className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          <span
            className={cn(
              "text-xs",
              i === step ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {i + 1}. {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

function useCountdown(to?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return null;
  return Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
}

export function CheckoutFlow() {
  const sellerId = useSearchParams().get("seller");
  if (!sellerId) {
    return (
      <Container>
        <EmptyState
          title="Choose what to check out"
          description="Stablecoin escrow checks out one label at a time. Start from checkout and choose “Pay with stablecoin”."
          action={{ href: "/checkout", label: "Go to checkout" }}
        />
      </Container>
    );
  }
  return (
    <RequireAuth
      title="Sign in to pay with stablecoin"
      description="Stablecoin escrow needs an account with a verified wallet. Card checkout does not."
      wallet
      walletAction={<ConnectWallet label="Connect wallet" />}
    >
      {() => <Flow sellerId={sellerId} />}
    </RequireAuth>
  );
}

function Flow({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const { chainId: walletChain } = useAccount();
  const [step, setStep] = useState(0);
  const [shipping, setShipping] = useState({
    name: "",
    line1: "",
    line2: "",
    city: "",
    postalCode: "",
    country: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<"smart" | "wallet">("smart");
  const [orderId, setOrderId] = useState<string | null>(null);
  const exec = useExecuteCalls();

  const quote = useQuery({
    queryKey: ["quote", sellerId],
    queryFn: () => api<Quote>("/api/checkout/quote", { body: { sellerId } }),
    enabled: step >= 1 && !orderId,
    staleTime: 60_000,
    retry: false,
  });
  const remaining = useCountdown(quote.data?.expiresAt);

  useEffect(() => {
    if (!quote.data) return;
    const routes = quote.data.routes;
    const onWalletChain =
      routes.find((r) => r.available && r.sourceChainId === walletChain && r.kind === "direct") ??
      routes.find((r) => r.available && r.sourceChainId === walletChain);
    setSelected((cur) =>
      cur && routes.some((r) => r.key === cur && r.available)
        ? cur
        : (onWalletChain?.key ?? quote.data!.recommendedKey),
    );
  }, [quote.data, walletChain]);

  const route = quote.data?.routes.find((r) => r.key === selected);
  const grouped = useMemo(() => {
    const m = new Map<number, Route[]>();
    for (const r of quote.data?.routes ?? [])
      m.set(r.sourceChainId, [...(m.get(r.sourceChainId) ?? []), r]);
    return [...m.entries()];
  }, [quote.data]);

  const initiate = useMutation({
    mutationFn: async () => {
      const res = await api<{ orderId: string; calls: TxCall[] }>("/api/checkout/initiate", {
        body: {
          quoteId: quote.data!.quoteId,
          routeKey: selected,
          buyerAccountMode: accountMode,
          shippingAddress: { ...shipping, line2: shipping.line2 || undefined },
        },
      });
      setOrderId(res.orderId);
      qc.invalidateQueries({ queryKey: ["cart"] });
      setStep(3);
      await exec.run(res.calls);
      return res;
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function validateShipping() {
    const e: Record<string, string> = {};
    if (shipping.name.trim().length < 2) e.name = "Enter the recipient's name";
    if (shipping.line1.trim().length < 3) e.line1 = "Enter a street address";
    if (shipping.city.trim().length < 2) e.city = "Enter a city";
    if (shipping.postalCode.trim().length < 2) e.postalCode = "Enter a postal code";
    if (!/^[a-zA-Z]{2}$/.test(shipping.country.trim()))
      e.country = "Use a 2-letter country code, e.g. US";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const field = (
    k: keyof typeof shipping,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label} htmlFor={`ship-${k}`} error={errors[k]}>
      <Input
        id={`ship-${k}`}
        value={shipping[k]}
        onChange={(e) => setShipping({ ...shipping, [k]: e.target.value })}
        aria-invalid={!!errors[k]}
        aria-describedby={errors[k] ? `ship-${k}-error` : undefined}
        {...props}
      />
    </Field>
  );

  return (
    <Container className="max-w-5xl">
      <PageHeader
        title="Checkout"
        description="Every order is paid into escrow — the seller is paid only after delivery."
      />
      <Stepper step={step} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Shipping address</CardTitle>
                <CardDescription>
                  Only you, the seller and (if you open a dispute) an arbiter can see it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validateShipping()) setStep(1);
                  }}
                  noValidate
                >
                  {field("name", "Full name", { autoComplete: "name", className: "" })}
                  {field("country", "Country (2-letter)", {
                    autoComplete: "country",
                    maxLength: 2,
                  })}
                  <div className="sm:col-span-2">
                    {field("line1", "Address", { autoComplete: "address-line1" })}
                  </div>
                  <div className="sm:col-span-2">
                    {field("line2", "Apartment, suite (optional)", {
                      autoComplete: "address-line2",
                    })}
                  </div>
                  {field("city", "City", { autoComplete: "address-level2" })}
                  {field("postalCode", "Postal code", { autoComplete: "postal-code" })}
                  <div className="sm:col-span-2 flex justify-end">
                    <Button type="submit">Continue to payment</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Pay with</CardTitle>
                  <CardDescription>
                    Pick any token on any supported chain — Trestle routes it to the seller&apos;s
                    payout chain.
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => quote.refetch()}
                  loading={quote.isFetching}
                  aria-label="Refresh quote"
                >
                  <RefreshCw /> Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {quote.isLoading ? (
                  <div className="space-y-3" aria-busy="true">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                  </div>
                ) : quote.isError ? (
                  <ErrorState
                    title="Couldn't get a quote"
                    message={errorMessage(quote.error)}
                    retry={() => quote.refetch()}
                  />
                ) : quote.data ? (
                  <div className="space-y-6">
                    {grouped.map(([chainId, routes]) => (
                      <fieldset key={chainId}>
                        <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
                          From <ChainBadge chainId={chainId} />{" "}
                          {walletChain === chainId && (
                            <Badge tone="primary">your wallet&apos;s network</Badge>
                          )}
                        </legend>
                        <div
                          className="grid gap-2"
                          role="radiogroup"
                          aria-label={`Payment options on chain ${chainId}`}
                        >
                          {routes.map((r) => (
                            <label
                              key={r.key}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                                !r.available && "cursor-not-allowed opacity-60",
                                selected === r.key
                                  ? "border-primary bg-primary-soft/60"
                                  : "border-border hover:bg-muted/60",
                              )}
                            >
                              <input
                                type="radio"
                                name="route"
                                className="mt-1 accent-[var(--primary)]"
                                value={r.key}
                                checked={selected === r.key}
                                disabled={!r.available}
                                onChange={() => setSelected(r.key)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium">{r.payToken.symbol}</span>
                                  {r.available && r.sourceAmount ? (
                                    <span className="tabular font-semibold">
                                      {tokenAmount(r.sourceAmount, r.payToken.decimals, 6)}{" "}
                                      {r.payToken.symbol}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Unavailable
                                    </span>
                                  )}
                                </div>
                                {r.available ? (
                                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    <span>{r.label}</span>
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="size-3" aria-hidden /> ~
                                      {duration(r.estimatedSeconds)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <ShieldCheck className="size-3" aria-hidden /> security{" "}
                                      {r.securityScore}/100
                                    </span>
                                  </div>
                                ) : (
                                  <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                    <p className="text-xs text-muted-foreground">{quote.data.priceSource}.</p>
                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setStep(0)}>
                        Back
                      </Button>
                      <Button disabled={!route?.available} onClick={() => setStep(2)}>
                        Review order
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {step === 2 && route && quote.data && (
            <Card>
              <CardHeader>
                <CardTitle>Review route &amp; sign</CardTitle>
                <CardDescription>{route.label}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">You pay</dt>
                  <dd className="tabular text-right font-semibold">
                    {tokenAmount(route.sourceAmount, route.payToken.decimals, 8)}{" "}
                    {route.payToken.symbol}
                  </dd>
                  <dt className="text-muted-foreground">
                    Protocol fee ({(route.effectiveFeeBps ?? 0) / 100}%)
                  </dt>
                  <dd className="tabular text-right">
                    {tokenAmount(route.feeAmount, route.payToken.decimals, 8)}{" "}
                    {route.payToken.symbol}
                  </dd>
                  {route.kind === "cross-chain" && (
                    <>
                      <dt className="text-muted-foreground">Solver spread</dt>
                      <dd className="tabular text-right">{usd(route.solverSpreadUsdMicros)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Seller receives (escrowed)</dt>
                  <dd className="tabular text-right">
                    {tokenAmount(route.destAmount, route.payoutToken!.decimals, 6)}{" "}
                    {route.payoutToken!.symbol} on <ChainBadge chainId={route.destChainId} />
                  </dd>
                  <dt className="text-muted-foreground">Estimated settlement</dt>
                  <dd className="text-right">~{duration(route.estimatedSeconds)}</dd>
                </dl>

                <div className="rounded-lg border border-border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-primary" aria-hidden /> Route security
                    score: {route.securityScore}/100
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {route.securityNotes?.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium">
                    Escrow buyer account on the destination chain
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        v: "smart" as const,
                        icon: Fuel,
                        t: "Gasless smart account (recommended)",
                        d: "Confirm delivery or dispute later without holding gas — sponsored by the Trestle paymaster (ERC-4337).",
                      },
                      {
                        v: "wallet" as const,
                        icon: Wallet,
                        t: "My wallet",
                        d: "Manage the order with normal transactions from this wallet; you need gas on the payout chain.",
                      },
                    ].map((o) => (
                      <label
                        key={o.v}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-lg border p-3",
                          accountMode === o.v
                            ? "border-primary bg-primary-soft/60"
                            : "border-border",
                        )}
                      >
                        <input
                          type="radio"
                          name="account"
                          className="mt-1 accent-[var(--primary)]"
                          checked={accountMode === o.v}
                          onChange={() => setAccountMode(o.v)}
                        />
                        <span>
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <o.icon className="size-4" aria-hidden /> {o.t}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">{o.d}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {remaining !== null && remaining < 60 && (
                  <Notice tone="warning">
                    <AlertTriangle className="mr-1 inline size-4" aria-hidden /> This quote expires
                    in {remaining}s. Refresh it if needed.
                  </Notice>
                )}
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    size="lg"
                    loading={initiate.isPending}
                    disabled={remaining === 0}
                    onClick={() => initiate.mutate()}
                  >
                    Confirm &amp; sign
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your wallet will ask you to{" "}
                  {route.payToken.isNative
                    ? "send one transaction"
                    : "approve the token (if needed) and send one transaction"}{" "}
                  on <ChainBadge chainId={route.sourceChainId} />. The calldata is built by the
                  server from your quote.
                </p>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <TxSteps steps={exec.steps} />
                  {initiate.isError && orderId && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="text-sm text-danger">
                        The payment wasn&apos;t completed. Your items stay reserved for a while.
                      </p>
                      <Button variant="outline" asChild>
                        <Link href={`/orders/${orderId}`}>Retry from the order page</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              {orderId &&
                exec.steps.some(
                  (s) => s.status === "done" || s.status === "pending" || s.status === "syncing",
                ) && <LiveStatus orderId={orderId} />}
            </motion.div>
          )}
        </div>

        <aside aria-label="Order summary">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
              {quote.data && (
                <CardDescription>Sold by {quote.data.seller.storefrontName}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.data ? (
                <>
                  <ul className="space-y-2 text-sm">
                    {quote.data.items.map((i) => (
                      <li key={i.variantId} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate">{i.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {i.variantName} × {i.quantity}
                          </span>
                        </span>
                        <span className="tabular">
                          {usd(BigInt(i.unitPriceUsdMicros) * BigInt(i.quantity))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between border-t border-border pt-3 font-semibold">
                    <span>Subtotal</span>
                    <span className="tabular">{usd(quote.data.subtotalUsdMicros)}</span>
                  </div>
                  {remaining !== null && step < 3 && (
                    <p className="text-xs text-muted-foreground">
                      Quote valid for {Math.floor(remaining / 60)}:
                      {String(remaining % 60).padStart(2, "0")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your items and totals appear once we fetch a quote.
                </p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-success" aria-hidden /> Escrow-protected ·
                dispute before the delivery deadline
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </Container>
  );
}
