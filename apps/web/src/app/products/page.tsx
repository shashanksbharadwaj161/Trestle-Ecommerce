import type { Metadata } from "next";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";
import { EDITORIAL } from "@/lib/editorial";

export const metadata: Metadata = { title: "Shop all", description: "Every Trestle product." };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <ListingPage
      searchParams={await searchParams}
      preset={{
        title: "Shop all",
        breadcrumb: [{ label: "Home", href: "/" }, { label: "Shop all" }],
        basePath: "/products",
        editorial: EDITORIAL.all,
        chips: ["dresses", "t-shirts", "jeans", "shorts", "knit-hats"],
      }}
    />
  );
}
