import type { Metadata } from "next";
import { CryptoProviders } from "@/components/crypto-providers";
import { WalletView } from "./wallet-view";

export const metadata: Metadata = { title: "Wallet & escrow" };

export default function WalletPage() {
  return (
    <CryptoProviders>
      <WalletView />
    </CryptoProviders>
  );
}
