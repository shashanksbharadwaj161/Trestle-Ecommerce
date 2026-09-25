import type { Metadata } from "next";
import { CryptoProviders } from "@/components/crypto-providers";
import { LoyaltyView } from "./loyalty-view";

export const metadata: Metadata = { title: "Loyalty" };

export default function LoyaltyPage() {
  return (
    <CryptoProviders>
      <LoyaltyView />
    </CryptoProviders>
  );
}
