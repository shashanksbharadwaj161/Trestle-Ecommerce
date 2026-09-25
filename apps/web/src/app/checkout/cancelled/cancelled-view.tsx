"use client";
import Link from "@/components/link";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

/** Stripe cancel_url: release the held items (the session is expired first so it can no longer be paid). */
export function CancelledView({ paymentId }: { paymentId: string | null }) {
  const [state, setState] = useState<"working" | "released" | "paid" | "error">("working");
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const ran = useRef(false);
  useEffect(() => {
    if (!paymentId || ran.current) return;
    ran.current = true;
    api<{ payment: { status: string } }>(`/api/checkout/card/${paymentId}/cancel`, { body: {} })
      .then((r) => {
        const s = r.payment.status;
        setState(s === "PAID" || s === "PROCESSING" ? "paid" : "released");
        qc.invalidateQueries({ queryKey: ["cart"] });
      })
      .catch((e) => {
        setState("error");
        setMsg(errorMessage(e));
      });
  }, [paymentId, qc]);

  if (state === "paid")
    return (
      <div>
        <h1 className="text-[1.75rem] tracking-[-0.02em]">This order was already paid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your payment went through before you left the payment page.
        </p>
        <Button asChild className="mt-6">
          <Link href={`/checkout/complete?payment=${paymentId}`}>View your order</Link>
        </Button>
      </div>
    );
  return (
    <div>
      <h1 className="text-[1.75rem] tracking-[-0.02em]">Checkout cancelled</h1>
      <p className="mt-2 text-sm text-muted-foreground" role="status">
        {state === "working"
          ? "Releasing the items we were holding for you…"
          : state === "error"
            ? `We couldn’t confirm the cancellation (${msg}). Nothing was charged; held items are released automatically when the session expires.`
            : "No payment was taken. Your bag still has everything in it."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/checkout">Return to checkout</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/bag">View bag</Link>
        </Button>
      </div>
    </div>
  );
}
