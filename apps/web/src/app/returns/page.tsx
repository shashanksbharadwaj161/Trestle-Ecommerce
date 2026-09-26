import type { Metadata } from "next";
import Link from "@/components/link";
import { ContentPage } from "@/components/content-page";
import { POLICY } from "@/lib/policy";
import { paymentAvailability } from "@/server/payments";

export const metadata: Metadata = { title: "Returns" };
export const dynamic = "force-dynamic";

export default function ReturnsPage() {
  return (
    <ContentPage title="Returns" current="/returns" intro={POLICY.returns}>
      <h2>How to return</h2>
      <ul>
        <li>
          Open your order — from <Link href="/account">your account</Link>, or the private link on
          your confirmation page if you checked out as a guest.
        </li>
        <li>Choose “Request a return”, select the items and a reason.</li>
        <li>We review the request and update the order page with next steps.</li>
        <li>Once we receive the items, the refund is issued to your original payment method.</li>
      </ul>
      {paymentAvailability().crypto && (
        <>
          <h2>Stablecoin (escrow) orders</h2>
          <p>
            Escrow orders are protected differently: until you confirm delivery the funds stay in
            the escrow contract, and you can open a dispute from the order page. See{" "}
            <Link href="/payments">payment options</Link>.
          </p>
        </>
      )}
    </ContentPage>
  );
}
