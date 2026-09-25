import type { Metadata } from "next";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";
import { NEW_ARRIVAL_DAYS } from "@/server/catalog";

export const metadata: Metadata = { title: "New in", description: "The latest arrivals at Trestle." };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return (
    <ListingPage
      searchParams={{ sort: "newest", ...sp }}
      preset={{
        title: "New in",
        description: `Everything added in the last ${NEW_ARRIVAL_DAYS} days, newest first.`,
        breadcrumb: [{ label: "Home", href: "/" }, { label: "New in" }],
        newOnly: true,
        basePath: "/new",
        chips: ["dresses", "t-shirts", "jeans", "shorts", "knit-hats"],
      }}
    />
  );
}
