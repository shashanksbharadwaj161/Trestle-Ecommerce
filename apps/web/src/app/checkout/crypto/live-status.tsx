"use client";
import Link from "@/components/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface OrderResp {
  order: {
    status: string;
    paymentIntents: {
      routeKind: string;
      status: string;
      onchainIntentId: string | null;
      sourceTxHash: string | null;
      fulfillTxHash: string | null;
      failureReason: string | null;
    }[];
  };
}

/** Live settlement tracker: Created → Routing → Fulfilled → Escrowed (polls the order until escrow is funded). */
export function LiveStatus({ orderId }: { orderId: string }) {
  const q = useQuery({
    queryKey: ["order", orderId, "live"],
    queryFn: () => api<OrderResp>(`/api/orders/${orderId}`),
    refetchInterval: (query) => {
      const s = query.state.data?.order.status;
      return s && s !== "PENDING_PAYMENT" ? false : 2_000;
    },
  });
  const intent = q.data?.order.paymentIntents.at(-1);
  const cross = intent?.routeKind === "CROSS_CHAIN";
  const escrowed = q.data && !["PENDING_PAYMENT", "CANCELLED"].includes(q.data.order.status);
  const failed = intent?.status === "FAILED";
  const stages = cross
    ? [
        {
          k: "Created",
          done: !!intent?.onchainIntentId || !!intent?.sourceTxHash,
          d: "Payment locked on the source chain",
        },
        {
          k: "Routing",
          done: intent?.status === "ROUTING" || intent?.status === "FULFILLED",
          d: "Relayer attests the intent after confirmations",
        },
        {
          k: "Fulfilled",
          done: intent?.status === "FULFILLED",
          d: "Solver liquidity funds escrow on the payout chain",
        },
        { k: "Escrowed", done: !!escrowed, d: "Funds held until you confirm delivery" },
      ]
    : [
        {
          k: "Paid",
          done: !!intent?.sourceTxHash || !!escrowed,
          d: "Payment sent straight to the escrow contract",
        },
        { k: "Escrowed", done: !!escrowed, d: "Funds held until you confirm delivery" },
      ];
  const current = stages.findIndex((s) => !s.done);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {failed
            ? "Payment refunded"
            : escrowed
              ? "Your order is protected by escrow"
              : "Settling your payment…"}
        </CardTitle>
        <CardDescription>
          {failed
            ? `The relayer could not fulfil this intent (${intent?.failureReason}). Your payment was returned on the source chain.`
            : "This updates live as on-chain events are confirmed."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-4" aria-live="polite">
          {stages.map((s, i) => (
            <li
              key={s.k}
              className={cn(
                "rounded-lg border p-3",
                s.done
                  ? "border-success/40 bg-success-soft"
                  : i === current && !failed
                    ? "border-primary/50"
                    : "border-border",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                {s.done ? (
                  <Check className="size-4 text-success" aria-hidden />
                ) : i === current && !failed ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                ) : (
                  <span className="size-4" />
                )}
                {s.k}
                <span className="sr-only">
                  {s.done ? "(complete)" : i === current ? "(in progress)" : "(pending)"}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <Button variant={escrowed ? "primary" : "outline"} asChild>
            <Link href={`/orders/${orderId}`}>View order details</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
