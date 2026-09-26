import type { Metadata } from "next";
import Link from "@/components/link";
import { ContentPage } from "@/components/content-page";
import { paymentAvailability } from "@/server/payments";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const pay = paymentAvailability();
  return (
    <ContentPage title="Privacy" current="/privacy" intro="What we keep about you, and why.">
      <h2>What we store</h2>
      <ul>
        <li>
          Account: your name, email and a securely hashed password
          {pay.crypto ? ", and a wallet address if you link one" : ""}.
        </li>
        <li>Orders: the items, your delivery details and email, and the payment status.</li>
        <li>Guest orders: a hashed version of your private order link — never the link itself.</li>
        <li>Your bag, identified by a cookie, and your wishlist if you are signed in.</li>
        <li>Messages you send us through the contact form.</li>
      </ul>
      <h2>What we don’t store</h2>
      <p>Card numbers. Card payments are handled entirely by our payment provider, Stripe.</p>
      <h2>Cookies</h2>
      <p>
        Strictly necessary cookies only: your session, your bag, your display preferences and access
        to guest orders. We don’t use advertising or analytics cookies.
      </p>
      {pay.crypto && (
        <>
          <h2>On-chain data</h2>
          <p>
            If you pay with stablecoins, your wallet address and the transactions of your order are
            recorded on a public blockchain and cannot be erased.
          </p>
        </>
      )}
      <h2>Your choices</h2>
      <p>
        You can update your details, or delete an account without orders, from{" "}
        <Link href="/account/profile">your profile</Link>. For anything else,{" "}
        <Link href="/contact">contact us</Link>.
      </p>
    </ContentPage>
  );
}
