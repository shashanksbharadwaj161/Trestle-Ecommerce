import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/components/link";
import { listCollections } from "@/server/catalog";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export const metadata: Metadata = { title: "Collections" };

export default async function Page() {
  const cols = await listCollections();
  return (
    <div className="container-page pt-6 md:pt-8">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Collections" }]} />
      <h1 className="mt-6 text-[2rem] tracking-[-0.03em] md:mt-10 md:text-[2.75rem]">
        Collections
      </h1>
      {cols.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No collections are published yet.</p>
      ) : (
        <ul className="mt-10 grid gap-x-4 gap-y-10 md:grid-cols-2">
          {cols.map((c, i) => (
            <li key={c.slug}>
              <Link href={`/collections/${c.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-muted md:aspect-[5/6]">
                  {c.image && (
                    <Image
                      src={c.image}
                      alt=""
                      fill
                      priority={i < 2}
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.02]"
                    />
                  )}
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <h2 className="text-xl tracking-tight">{c.title}</h2>
                  <span className="tabular text-sm text-muted-foreground">
                    {c._count.products} pieces
                  </span>
                </div>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{c.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
