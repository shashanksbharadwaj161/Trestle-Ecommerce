import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { CryptoProviders } from "@/components/crypto-providers";
import { CheckoutFlow } from "./checkout-flow";
import Link from "@/components/link";
import { EmptyState } from "@/components/states";
import { paymentAvailability } from "@/server/payments";

export const metadata: Metadata = { title: "Stablecoin checkout" };

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  if (!paymentAvailability().crypto) {
    return (
      <Container>
        <EmptyState
          level={1}
          title="Stablecoin payments aren’t available"
          description="Your bag is saved and nothing has been charged."
          action={
            <Link
              href="/bag"
              className="inline-flex h-10 items-center border border-foreground px-5 text-sm"
            >
              Back to your bag
            </Link>
          }
        />
      </Container>
    );
  }
  return (
    <Suspense
      fallback={
        <Container>
          <Skeleton className="h-96" />
        </Container>
      }
    >
      <CryptoProviders>
        <CheckoutFlow />
      </CryptoProviders>
    </Suspense>
  );
}
