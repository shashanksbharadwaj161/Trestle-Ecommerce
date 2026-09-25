import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy" current="/privacy" ownerContent intro="What this demo store stores, and why.">
      <h2>What we store</h2>
      <ul>
        <li>Account: name, email, a salted password hash, and a wallet address if you link one.</li>
        <li>Orders: items, delivery address and email as collected by Stripe Checkout, and payment status.</li>
        <li>Guest orders: a hash of your private order link (never the link itself).</li>
        <li>Your bag in a session store, identified by a cookie.</li>
        <li>Messages you send through the contact form.</li>
      </ul>
      <h2>What we don’t store</h2>
      <p>Card numbers. Card payments are handled entirely on Stripe’s hosted page.</p>
      <h2>Cookies</h2>
      <p>
        Strictly necessary cookies only: your session, your bag, and access to guest orders. There are no advertising or
        analytics cookies in this build.
      </p>
      <h2>On-chain data</h2>
      <p>
        If you pay with stablecoins, your wallet address and the transactions of your order are recorded on a public
        blockchain and cannot be erased.
      </p>
    </ContentPage>
  );
}
