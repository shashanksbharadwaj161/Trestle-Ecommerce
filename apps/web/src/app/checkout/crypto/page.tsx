import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { CryptoProviders } from "@/components/crypto-providers";
import { CheckoutFlow } from "./checkout-flow";

export const metadata: Metadata = { title: "Stablecoin checkout" };

export default function CheckoutPage() {
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
