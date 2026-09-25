import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@trestle/db";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Image credits" };
export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const sources = await prisma.productImage
    .groupBy({ by: ["credit", "license"], _count: { _all: true } })
    .catch(() => []);
  const free = JSON.parse(
    await readFile(path.join(process.cwd(), "public/images/fashion-free/manifest.json"), "utf8").catch(() => "[]"),
  ) as { name: string; source: string; license: string; licenseUrl: string; usage: string }[];
  return (
    <ContentPage title="Image credits" current="/credits" intro="Where the photography on this site comes from.">
      <ul>
        {sources.map((s) => (
          <li key={`${s.credit}-${s.license}`}>
            {s.credit ?? "Uncredited"} — {s.license ?? "licence not recorded"} ({s._count._all} images)
          </li>
        ))}
      </ul>
      {free.length > 0 && (
        <>
          <h2>High-resolution editorial photographs</h2>
          <ul>
            {free.map((f) => (
              <li key={f.name}>
                <a href={f.source} rel="noreferrer noopener">{f.name}</a> — <a href={f.licenseUrl} rel="noreferrer noopener">{f.license}</a>. {f.usage}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        The rest of the demo catalogue uses the Sylius demo fixture images from{" "}
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
