import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <ContentPage title="Terms" current="/terms" ownerContent intro="Terms of sale for this demo storefront.">
      <p>
        This is a demonstration store. Unless card payments are configured in live mode, no real payments are taken
        and no goods are shipped. Test-network tokens have no monetary value.
      </p>
      <p>
        The store owner must publish their own terms of sale here — including seller identity, pricing and tax rules,
        delivery and return obligations, warranty terms and governing law — before accepting real orders.
      </p>
    </ContentPage>
  );
}
