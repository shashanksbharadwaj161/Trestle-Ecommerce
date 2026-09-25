"use client";
import { use } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Container, PageHeader } from "@/components/states";
import { ProductEditor } from "@/components/product-editor";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAuth role="SELLER">
      {() => (
        <Container className="max-w-5xl">
          <PageHeader title="Edit product" />
          <ProductEditor productId={id} backHref="/seller/products" />
        </Container>
      )}
    </RequireAuth>
  );
}
