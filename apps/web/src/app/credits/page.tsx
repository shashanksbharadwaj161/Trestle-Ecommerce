import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@trestle/db";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Image credits" };
export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const sources = await prisma.productImage
    .groupBy({ by: ["credit", "license"], _count: { _all: true } })
    .catch(() => []);
  return (
    <ContentPage title="Image credits" current="/credits" intro="Where the photography on this site comes from.">
      <ul>
        {sources.map((s) => (
          <li key={`${s.credit}-${s.license}`}>
            {s.credit ?? "Uncredited"} — {s.license ?? "licence not recorded"} ({s._count._all} images)
          </li>
        ))}
      </ul>
      <p>
        The demo catalogue uses the Sylius demo fixture images from{" "}
        <a href="https://github.com/Sylius/Sylius" rel="noreferrer noopener">github.com/Sylius/Sylius</a> (MIT licence,
        © Sylius Sp. z o.o.). They appear to be AI-generated: the people shown are not real models, and the garments are
        not products of any real brand. Product names, prices and details in this store are invented for the demo.
      </p>
      <p>
        Each product image records its exact source file. See <Link href="/help">help</Link> or the repository’s{" "}
        <code>docs/IMAGE_CREDITS.md</code>.
      </p>
    </ContentPage>
  );
}
