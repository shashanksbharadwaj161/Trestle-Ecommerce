import { CryptoProviders } from "@/components/crypto-providers";
import { SellerNav } from "./seller-nav";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <CryptoProviders>
      <SellerNav />
      {children}
    </CryptoProviders>
  );
}
