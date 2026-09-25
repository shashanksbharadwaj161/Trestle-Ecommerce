import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage, type SearchParams } from "@/components/listing/listing-page";
import { getCollection } from "@/server/catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCollection((await params).slug);
  return c ? { title: c.title, description: c.description } : { title: "Collection not found" };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const c = await getCollection(slug);
  if (!c) notFound();
  return (
    <ListingPage
      searchParams={await searchParams}
      preset={{
        title: c.title,
        description: c.description,
        breadcrumb: [{ label: "Home", href: "/" }, { label: "Collections", href: "/collections" }, { label: c.title }],
        collection: c.slug,
        basePath: `/collections/${c.slug}`,
      }}
    />
  );
}
