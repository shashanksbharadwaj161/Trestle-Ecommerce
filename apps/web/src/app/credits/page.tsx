import type { Metadata } from "next";
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
    await readFile(
      path.join(process.cwd(), "public/images/fashion-free/manifest.json"),
      "utf8",
    ).catch(() => "[]"),
  ) as { name: string; source: string; license: string; licenseUrl: string; usage: string }[];
  // attribution wording for shoppers (internal fixture labels are not shown)
  const label = (credit: string | null) =>
    (credit ?? "Trestle").replace(/\s*demo fixtures?/i, " catalogue photography").trim();
  return (
    <ContentPage
      title="Image credits"
      current="/credits"
      intro="The photographers and licences behind the images on this site."
    >
      <h2>Product photography</h2>
      <ul>
        {sources.map((s) => (
          <li key={`${s.credit}-${s.license}`}>
            {label(s.credit)} — {s.license ?? "licence on file"} ({s._count._all} images)
          </li>
        ))}
      </ul>
      <p>
        Catalogue photography from the{" "}
        <a href="https://github.com/Sylius/Sylius" rel="noreferrer noopener">
          Sylius
        </a>{" "}
        project, used under the MIT licence, © Sylius Sp. z o.o. Some of these images are
        AI-generated illustrations and do not show real people.
      </p>
      {free.length > 0 && (
        <>
          <h2>Editorial photography</h2>
          <ul>
            {free.map((f) => (
              <li key={f.name}>
                <a href={f.source} rel="noreferrer noopener">
                  {f.name.replace(/-/g, " ")}
                </a>{" "}
                —{" "}
                <a href={f.licenseUrl} rel="noreferrer noopener">
                  {f.license}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </ContentPage>
  );
}
