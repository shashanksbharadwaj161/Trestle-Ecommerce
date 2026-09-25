"use client";
import { use } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Container, PageHeader } from "@/components/states";
import { ProductEditor } from "@/components/product-editor";

export default function AdminEditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAuth role="ADMIN">
      {() => (
        <Container className="max-w-5xl">
          <PageHeader title="Edit product" />
          <ProductEditor productId={id} backHref="/admin/products" />
        </Container>
      )}
    </RequireAuth>
  );
}
