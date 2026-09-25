"use client";
import { RequireAuth } from "@/components/require-auth";
import { Container, PageHeader } from "@/components/states";
import { ProductAdminList } from "@/components/product-admin-list";

export default function AdminProducts() {
  return (
    <RequireAuth role="ADMIN">
      {() => (
        <Container>
          <PageHeader title="Products" description="Every product from every seller, in every status." />
          <ProductAdminList basePath="/admin/products" />
        </Container>
      )}
    </RequireAuth>
  );
}
