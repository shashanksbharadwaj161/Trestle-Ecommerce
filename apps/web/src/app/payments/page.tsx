import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content-page";
import { cardConfig } from "@/server/stripe";

export const metadata: Metadata = { title: "Payment options" };
export const dynamic = "force-dynamic";

export default function PaymentsPage() {
  const card = cardConfig();
  return (
    <ContentPage title="Payment options" current="/payments" intro="Two independent ways to pay. If one is unavailable, the other still works.">
      <h2>Card</h2>
      <p>
        Card checkout uses Stripe Checkout, a payment page hosted by Stripe. Your card number is entered there and never
        reaches Trestle’s servers. Your order is confirmed only when Stripe notifies us that the payment succeeded.
      </p>
      <p>
        Status on this deployment:{" "}
        <strong>
          {card.enabled ? (card.mode === "live" ? "live" : card.mode === "mock" ? "local test mock" : "Stripe test mode (no real charges)") : "not configured"}
        </strong>
        .
      </p>

      <h2 id="escrow">Stablecoin escrow</h2>
      <p>
        You can pay in test stablecoins or ETH from a supported chain. Your payment is locked in an escrow smart
        contract and released to the seller when you confirm delivery, or automatically after the delivery window.
        Before that you can open a dispute, which an arbiter resolves with a full, partial or zero refund.
      </p>
      <ul>
        <li>Cross-chain payments are routed by a solver and settled with a signed attestation.</li>
        <li>
          This build runs on test networks with test tokens. The relayer, attester and arbiter are operated by Trestle —
          read the <Link href="/transparency#trust-model">trust model</Link> before relying on it.
        </li>
        <li>Stablecoin checkout requires signing in with a wallet. Card checkout never does.</li>
      </ul>

      <h2 id="provenance">Provenance records</h2>
      <p>
        Sellers can mint an on-chain certificate for an item. It records who issued it and each transfer of ownership. It
        is a record kept by the seller — not an independent certification of authenticity.
      </p>

      <h2>Reputation and loyalty</h2>
      <p>
        Completed escrow orders build a non-transferable on-chain reputation score for buyers and sellers, and earn TRST
        loyalty tokens (test tokens with no monetary value). See your{" "}
        <Link href="/account/wallet">wallet &amp; escrow</Link> page.
      </p>
    </ContentPage>
  );
}
