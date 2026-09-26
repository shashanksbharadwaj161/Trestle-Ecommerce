import type { Metadata } from "next";
import Link from "@/components/link";
import { ContentPage } from "@/components/content-page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { POLICY } from "@/lib/policy";
import { paymentAvailability } from "@/server/payments";
import { paymentSummary } from "@/lib/payment-copy";

export const metadata: Metadata = { title: "Help centre" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Do I need an account to order?",
    a: (
      <>
        No. You can check out as a guest — your confirmation page gives you a private link to your
        order. An account keeps all your orders and your wishlist in one place.
      </>
    ),
  },
  {
    q: "How do I find my size?",
    a: (
      <>
        Every product page has a size guide with body measurements in centimetres and inches. See
        the <Link href="/size-guide">full size guide</Link> for how to measure.
      </>
    ),
  },
  {
    q: "How much is delivery?",
    a: (
      <>
        {POLICY.standard} {POLICY.express}
      </>
    ),
  },
  {
    q: "How do returns work?",
    a: (
      <>
        {POLICY.returns} <Link href="/returns">Returns policy</Link>.
      </>
    ),
  },
  {
    q: "I checked out as a guest and lost my order link.",
    a: (
      <>
        For your security we can’t look orders up by email alone.{" "}
        <Link href="/contact?topic=Order">Contact us</Link> with your order number and we’ll help.
      </>
    ),
  },
  {
    q: "Can I change or cancel my order?",
    a: (
      <>
        If it hasn’t shipped yet, <Link href="/contact?topic=Order">contact us</Link> as soon as
        possible. Once it has shipped, you can return it within {POLICY.returnDays} days of
        delivery.
      </>
    ),
  },
];

export const dynamic = "force-dynamic";

export default function HelpPage() {
  const pay = paymentAvailability();
  const faq = [
    ...FAQ.slice(0, 2),
    {
      q: "What payment methods do you accept?",
      a: (
        <>
          {paymentSummary(pay)} <Link href="/payments">Payment options</Link>.
        </>
      ),
    },
    ...FAQ.slice(2),
  ];
  return (
    <ContentPage
      title="Help centre"
      current="/help"
      intro="Answers to common questions. Can’t find yours? Contact us."
    >
      <Accordion type="multiple" className="not-prose border-t border-border">
        {faq.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger>{f.q}</AccordionTrigger>
            <AccordionContent className="[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </ContentPage>
  );
}
