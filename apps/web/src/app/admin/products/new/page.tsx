"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { Container, PageHeader } from "@/components/states";
import { Field, Select } from "@/components/ui/input";
import { ProductEditor } from "@/components/product-editor";
import { api } from "@/lib/api";

export default function AdminNewProduct() {
  return <RequireAuth role="ADMIN">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const sellers = useQuery({
    queryKey: ["admin-sellers-min"],
    queryFn: () => api<{ sellers: { id: string; storefrontName: string; slug: string }[] }>("/api/admin/sellers"),
  });
  const [seller, setSeller] = useState("");
  const list = sellers.data?.sellers ?? [];
  const chosen = seller || list[0]?.slug || "";
  return (
    <Container className="max-w-5xl">
      <PageHeader title="New product" />
      <Field label="Seller" htmlFor="seller" className="mb-10 max-w-sm">
        <Select id="seller" value={chosen} onChange={(e) => setSeller(e.target.value)}>
          {list.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.storefrontName}
            </option>
          ))}
        </Select>
      </Field>
      {chosen && <ProductEditor key={chosen} productId={null} backHref="/admin/products" sellerParam={chosen} />}
    </Container>
  );
}
