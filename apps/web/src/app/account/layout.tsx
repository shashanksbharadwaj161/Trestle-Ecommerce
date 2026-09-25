import { AccountNav } from "./account-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AccountNav />
      {children}
    </>
  );
}
