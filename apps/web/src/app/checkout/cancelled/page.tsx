import type { Metadata } from "next";
import { CancelledView } from "./cancelled-view";

export const metadata: Metadata = { title: "Checkout cancelled", robots: { index: false } };

export default async function CancelledPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  return (
    <div className="container-page max-w-2xl pt-10 md:pt-16">
      <CancelledView paymentId={payment ?? null} />
    </div>
  );
}
