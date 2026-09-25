import type { Metadata } from "next";
import Link from "@/components/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Find a guest order" };

export default async function OrderLookup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="container-page max-w-2xl pt-10 md:pt-16">
      <h1 className="text-[2rem] tracking-[-0.03em]">Find a guest order</h1>
      {error && (
        <p role="alert" className="mt-4 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error === "rate"
            ? "Too many attempts. Please wait a few minutes and try again."
            : "That order link isn’t valid. Check that you copied the whole link."}
        </p>
      )}
      <div className="prose-trestle mt-6">
        <p>
          Guest orders are protected by a private link shown on your confirmation page. Open that
          link on any device to see your order, tracking and returns.
        </p>
        <p>
          For your security we don’t look orders up by email address alone. If you’ve lost the link,
          contact us with your order number and we’ll help.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/contact?topic=Order">Contact us</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in to your account</Link>
        </Button>
      </div>
    </div>
  );
}
