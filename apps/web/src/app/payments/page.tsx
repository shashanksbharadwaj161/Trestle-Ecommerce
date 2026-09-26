import type { Metadata } from "next";
import Link from "@/components/link";
import { ContentPage } from "@/components/content-page";
import { cardConfig } from "@/server/stripe";
import { paymentAvailability } from "@/server/payments";

export const metadata: Metadata = { title: "Payment options" };
export const dynamic = "force-dynamic";

export default function PaymentsPage() {
  const pay = paymentAvailability();
  const card = cardConfig();
  const none = !pay.card && !pay.crypto;
  return (
    <ContentPage
      title="Payment options"
      current="/payments"
      intro={
        none
          ? "Online checkout is temporarily unavailable, so orders can’t be placed right now. Your bag and wishlist are saved for when it reopens."
          : "How you can pay for your order."
      }
    >
      {pay.card && (
        <>
          <h2>Card</h2>
          <p>
            Pay by card on Stripe’s secure, hosted payment page — no account needed. Your card
            number is entered with Stripe and never reaches our servers, and your order is confirmed
            only once the payment has succeeded.
          </p>
          {card.mode === "test" && (
            <p>
              <strong>Card payments currently run in Stripe test mode:</strong> no real charge is
              made and no order is shipped.
            </p>
          )}
        </>
      )}

      {pay.crypto && (
        <>
          <h2 id="escrow">Stablecoin escrow</h2>
          <p>
            Pay in stablecoins or ETH from a supported chain. Your payment is locked in an escrow
            smart contract and released to the seller when you confirm delivery, or automatically
            after the delivery window. Until then you can open a dispute, resolved with a full,
            partial or zero refund.
          </p>
          <ul>
            <li>
              Cross-chain payments are routed by a solver and settled with a signed attestation.
            </li>
            <li>
              This service runs on test networks with test tokens that have no monetary value. The
              relayer, attester and arbiter are operated by Trestle — read the{" "}
              <Link href="/transparency#trust-model">trust model</Link> before relying on it.
            </li>
            <li>Stablecoin checkout requires signing in with a wallet.</li>
          </ul>
          <h2 id="provenance">Provenance records</h2>
          <p>
            Sellers can mint an on-chain certificate for an item. It records who issued it and each
            transfer of ownership. It is a record kept by the seller — not an independent
            certification of authenticity.
          </p>
        </>
      )}

      {none && (
        <>
          <h2>In the meantime</h2>
          <ul>
            <li>
              Browse the collections and save pieces to your <Link href="/wishlist">wishlist</Link>{" "}
              or <Link href="/bag">bag</Link>.
            </li>
            <li>
              <Link href="/register">Create an account</Link> to keep your wishlist across devices.
            </li>
            <li>
              Questions about sizing or an order? <Link href="/contact">Contact us</Link>.
            </li>
          </ul>
        </>
      )}
    </ContentPage>
  );
}
