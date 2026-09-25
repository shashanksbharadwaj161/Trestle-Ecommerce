import type { Metadata } from "next";
import { CardOrderView } from "@/components/card-order-view";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

/**
 * Stripe's success_url lands here. This page NEVER marks anything paid: it only displays the status that
 * the signed webhook has recorded, polling until it arrives.
 */
export default async function CompletePage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  return (
    <div className="container-page max-w-3xl pt-10 md:pt-16">
      {payment ? (
        <CardOrderView paymentId={payment} context="complete" />
      ) : (
        <p className="text-muted-foreground">No order reference in this link.</p>
      )}
    </div>
  );
}
