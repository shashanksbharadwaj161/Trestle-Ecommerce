import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicStats } from "@/server/stats";
import { paymentAvailability } from "@/server/payments";
import { TransparencyView } from "./view";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "Live escrow states, payment-intent routing, settlement proofs and dispute outcomes.",
};

export default async function TransparencyPage() {
  // an escrow dashboard is only meaningful where stablecoin escrow is live
  if (!paymentAvailability().crypto) notFound();
  let initial: unknown = null;
  try {
    initial = JSON.parse(
      JSON.stringify(await publicStats(), (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    );
  } catch (err) {
    // render the page with a clear "temporarily unavailable" state (the client retries) instead of an error page
    console.error("[transparency] stats unavailable", (err as Error).message);
  }
  return <TransparencyView initial={initial} />;
}
