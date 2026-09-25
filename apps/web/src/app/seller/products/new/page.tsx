"use client";
import { RequireAuth } from "@/components/require-auth";
import { Container, PageHeader } from "@/components/states";
import { ProductEditor } from "@/components/product-editor";

export default function NewProductPage() {
  return (
    <RequireAuth role="SELLER">
      {() => (
        <Container className="max-w-5xl">
          <PageHeader title="New product" />
          <ProductEditor productId={null} backHref="/seller/products" />
        </Container>
      )}
    </RequireAuth>
  );
}
