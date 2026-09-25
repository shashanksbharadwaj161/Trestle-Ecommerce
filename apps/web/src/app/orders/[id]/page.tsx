import type { Metadata } from "next";
import { OrderView } from "./order-view";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderView orderId={id} />;
}
