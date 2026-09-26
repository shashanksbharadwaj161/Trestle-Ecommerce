import type { Metadata } from "next";
import { publicStats } from "@/server/stats";
import { TransparencyView } from "./view";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "Live escrow states, payment-intent routing, settlement proofs and dispute outcomes.",
};

export default async function TransparencyPage() {
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
