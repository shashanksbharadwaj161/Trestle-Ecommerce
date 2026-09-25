import type { Metadata } from "next";
import { protocolStats } from "@/server/stats";
import { TransparencyView } from "./view";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "Live escrow states, payment-intent routing, settlement proofs and dispute outcomes.",
};

export default async function TransparencyPage() {
  const initial = JSON.parse(
    JSON.stringify(await protocolStats(), (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  return <TransparencyView initial={initial} />;
}
