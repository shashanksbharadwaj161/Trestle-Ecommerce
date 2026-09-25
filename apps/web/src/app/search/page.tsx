import type { Metadata } from "next";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <ListingPage
      searchParams={await searchParams}
      preset={{
        title: "Search",
        breadcrumb: [{ label: "Home", href: "/" }, { label: "Search" }],
        basePath: "/search",
      }}
    />
  );
}
