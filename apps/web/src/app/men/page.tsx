import type { Metadata } from "next";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";
import { EDITORIAL } from "@/lib/editorial";

export const metadata: Metadata = { title: "Men", description: "Tees, jeans and shorts for men." };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <ListingPage
      searchParams={await searchParams}
      preset={{
        title: "Men",
        description: "Heavyweight and lightweight tees, straight and relaxed denim.",
        breadcrumb: [{ label: "Home", href: "/" }, { label: "Men" }],
        department: "men",
        basePath: "/men",
        editorial: EDITORIAL.men,
        chips: ["t-shirts", "jeans", "shorts"],
      }}
    />
  );
}
