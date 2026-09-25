import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutFlow } from "./checkout-flow";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <Container>
          <Skeleton className="h-96" />
        </Container>
      }
    >
      <CheckoutFlow />
    </Suspense>
  );
}
