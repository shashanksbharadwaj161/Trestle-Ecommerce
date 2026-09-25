import type { Metadata } from "next";
import Link from "next/link";
import { CardOrderView } from "@/components/card-order-view";

export const metadata: Metadata = { title: "Order status", robots: { index: false } };

export default async function OrderStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container-page max-w-3xl pt-8 md:pt-12">
      <Link href="/account" className="text-[0.8125rem] text-muted-foreground hover:text-foreground">
        ← Your account
      </Link>
      <div className="mt-6">
        <CardOrderView paymentId={id} context="status" />
      </div>
    </div>
  );
}
