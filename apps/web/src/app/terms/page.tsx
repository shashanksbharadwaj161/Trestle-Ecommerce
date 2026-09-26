import type { Metadata } from "next";
import Link from "@/components/link";
import { ContentPage } from "@/components/content-page";
import { POLICY } from "@/lib/policy";
import { paymentAvailability } from "@/server/payments";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const pay = paymentAvailability();
  return (
    <ContentPage
      title="Terms"
      current="/terms"
      intro="The terms that apply when you shop with Trestle."
    >
      {!pay.card && !pay.crypto && (
        <p>
          <strong>Online checkout is temporarily unavailable.</strong> Orders can’t be placed until
          it reopens, and no payment is taken in the meantime.
        </p>
      )}
      <h2>Orders</h2>
      <p>
        An order is accepted only once payment has been confirmed and you have received a
        confirmation. If an item becomes unavailable after you order, we will let you know and
        refund it in full.
      </p>
      <h2>Prices</h2>
      <p>
        Prices are shown in US dollars. Delivery charges are shown at checkout before you pay. Local
        import duties or taxes are not included and may be charged on delivery.
      </p>
      <h2>Delivery and returns</h2>
      <p>
        Delivery options and times are set out on the <Link href="/delivery">delivery</Link> page.{" "}
        {POLICY.returns} See <Link href="/returns">returns</Link>.
      </p>
      <h2>Your account</h2>
      <p>
        Keep your password private. You can update your details or delete an account without orders
        at any time from <Link href="/account/profile">your profile</Link>.
      </p>
      <h2>Questions</h2>
      <p>
        If something isn’t right, <Link href="/contact">contact us</Link> and we’ll help.
      </p>
    </ContentPage>
  );
}
