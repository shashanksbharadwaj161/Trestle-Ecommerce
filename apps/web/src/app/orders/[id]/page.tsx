import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@trestle/db";
import { CryptoProviders } from "@/components/crypto-providers";
import { OrderView } from "./order-view";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // card orders have their own (webhook-driven) view; access is re-checked there
  const card = await prisma.order.findUnique({
    where: { id },
    select: { paymentMethod: true, cardPaymentId: true },
  });
  if (card?.paymentMethod === "CARD" && card.cardPaymentId) redirect(`/order-status/${card.cardPaymentId}`);
  return (
    <CryptoProviders>
      <OrderView orderId={id} />
    </CryptoProviders>
  );
}
