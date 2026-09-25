import type { Metadata } from "next";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";
import { EDITORIAL } from "@/lib/editorial";

export const metadata: Metadata = { title: "Accessories", description: "Knit hats and beanies." };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <ListingPage
      searchParams={await searchParams}
      preset={{
        title: "Accessories",
        description: "Ribbed, cabled and pompom knit hats. One size.",
        breadcrumb: [{ label: "Home", href: "/" }, { label: "Accessories" }],
        department: "unisex",
        basePath: "/accessories",
        editorial: EDITORIAL.accessories,
      }}
    />
  );
}
