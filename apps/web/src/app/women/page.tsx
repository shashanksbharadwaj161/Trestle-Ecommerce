import type { Metadata } from "next";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";
import { EDITORIAL } from "@/lib/editorial";

export const metadata: Metadata = { title: "Women", description: "Dresses, tees, jeans and shorts for women." };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <ListingPage
      searchParams={await searchParams}
      preset={{
        title: "Women",
        description: "Summer dresses, everyday jersey and denim in every wash.",
        breadcrumb: [{ label: "Home", href: "/" }, { label: "Women" }],
        department: "women",
        basePath: "/women",
        editorial: EDITORIAL.women,
        chips: ["dresses", "t-shirts", "jeans", "shorts"],
      }}
    />
  );
}
