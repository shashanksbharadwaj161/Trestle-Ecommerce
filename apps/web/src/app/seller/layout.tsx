import { SellerNav } from "./seller-nav";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SellerNav />
      {children}
    </>
  );
}
