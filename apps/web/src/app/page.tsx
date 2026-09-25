import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Box, CreditCard, LifeBuoy, RotateCcw } from "lucide-react";
import { toJsonSafe } from "@trestle/db";
import { listCollections, newArrivals, productCards } from "@/server/catalog";
import type { CardData } from "@/components/product-card";
import { ProductShelf } from "@/components/product-shelf";
import { ProductCard } from "@/components/product-card";
import { editorialImage as img } from "@/lib/editorial";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { label: "Dresses", href: "/women?category=dresses", image: img("dresses/dress_14") },
  { label: "T-shirts", href: "/products?category=t-shirts", image: img("t-shirts/man/t-shirt_04_2") },
  { label: "Jeans", href: "/products?category=jeans", image: img("jeans/woman/jeans_07_1") },
  { label: "Shorts", href: "/products?category=shorts", image: img("jeans/woman/jeans_13_2") },
  { label: "Knit hats", href: "/accessories", image: img("caps/cap_13_2") },
];

const SERVICES = [
  { icon: Box, title: "Free standard delivery", body: "On orders over $150. Express in 1–2 business days.", href: "/delivery" },
  { icon: RotateCcw, title: "30-day returns", body: "Request a return from your order page.", href: "/returns" },
  { icon: CreditCard, title: "Card or stablecoin", body: "Pay by card, or pay in stablecoins held in escrow.", href: "/payments" },
  { icon: LifeBuoy, title: "Help & sizing", body: "Size guides with measurements, care and contact.", href: "/help" },
];

async function load() {
  try {
    const [arrivals, collections, denim, men] = await Promise.all([
      newArrivals(10),
      listCollections(),
      productCards({ collections: { some: { collection: { slug: "denim" } } }, featured: true }, 3),
      productCards({ department: "men" }, 4),
    ]);
    return {
      ok: true as const,
      arrivals: toJsonSafe(arrivals) as unknown as CardData[],
      collections,
      denim: toJsonSafe(denim) as unknown as CardData[],
      men: toJsonSafe(men) as unknown as CardData[],
    };
  } catch (err) {
    console.error("[home] catalogue unavailable", (err as Error).message);
    return { ok: false as const };
  }
}

export default async function Home() {
  const data = await load();
  return (
    <>
      {/* ---------------------------------------------------------------- campaign */}
      <section aria-labelledby="hero-title" className="relative">
        <div className="grid md:grid-cols-2">
          <Link href="/new" className="group relative block aspect-[4/5] overflow-hidden bg-[#d9d9d7] md:aspect-auto md:h-[min(90vh,1040px)]">
            <Image
              src="/images/fashion-free/evening-editorial.jpg"
              alt="Editorial studio photograph: a model in a long black gown, backlit against a pale grey wall"
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover object-[50%_55%] transition-transform duration-[1600ms] ease-out group-hover:scale-[1.02]"
            />
            <span className="absolute right-3 top-3 text-[0.6875rem] text-foreground/60">Editorial · not a product</span>
          </Link>
          <Link href="/products/ribbon-tie-blouse" className="group relative hidden overflow-hidden bg-[#f1f0ee] md:block md:h-[min(90vh,1040px)]">
            <Image
              src="/images/fashion-free/ivory-blouse.jpg"
              alt="The ivory ribbon-tie blouse, worn with the ribbon tied at the collar"
              fill
              priority
              sizes="50vw"
              className="object-cover object-[55%_35%] transition-transform duration-[1600ms] ease-out group-hover:scale-[1.02]"
            />
            <span className="absolute bottom-6 right-6 bg-background/90 px-3 py-2 text-[0.8125rem]">Ribbon-tie blouse — $129</span>
          </Link>
        </div>
        <div className="container-page py-10 md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0 md:py-14">
          <div className="md:pointer-events-auto md:max-w-[44%]">
            <p className="eyebrow text-muted-foreground md:text-foreground/70">The new season</p>
            <h1 id="hero-title" className="mt-3 text-[clamp(2.25rem,4.6vw,4.25rem)] font-medium leading-[0.98] tracking-[-0.035em] text-foreground md:text-[#171614]">
              Considered pieces, made to be worn often
            </h1>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/women" className="inline-flex h-11 min-w-36 items-center justify-center bg-[#171614] px-6 text-sm text-[#f7f6f2] transition-opacity hover:opacity-85">
                Shop women
              </Link>
              <Link href="/men" className="inline-flex h-11 min-w-36 items-center justify-center border border-[#171614] px-6 text-sm text-[#171614] transition-colors hover:bg-[#171614] hover:text-[#f7f6f2] max-md:border-foreground max-md:text-foreground">
                Shop men
              </Link>
            </div>
          </div>
        </div>
      </section>

      {!data.ok ? (
        <div className="container-page py-20 text-center">
          <p className="text-lg">The catalogue is temporarily unavailable.</p>
          <p className="mt-2 text-sm text-muted-foreground">Please refresh in a moment.</p>
        </div>
      ) : (
        <>
          {/* ---------------------------------------------------------------- collections */}
          {data.collections.length > 0 && (
            <section aria-labelledby="collections-title" className="container-page mt-16 md:mt-24">
              <div className="mb-6 flex items-end justify-between">
                <h2 id="collections-title" className="text-xl md:text-2xl">Shop the collections</h2>
                <Link href="/collections" className="flex items-center gap-1 text-sm underline underline-offset-4">
                  All collections
                </Link>
              </div>
              <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
                {data.collections.map((c) => (
                  <li key={c.slug} className="w-[72vw] shrink-0 snap-start sm:w-[44vw] md:w-auto">
                    <Link href={`/collections/${c.slug}`} className="group block">
                      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                        {c.image && (
                          <Image src={c.image} alt="" fill sizes="(min-width: 768px) 25vw, 72vw" className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]" />
                        )}
                      </div>
                      <p className="mt-3 text-[0.9375rem]">{c.title}</p>
                      <p className="text-[0.8125rem] text-muted-foreground">{c._count.products} pieces</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---------------------------------------------------------------- new in shelf */}
          {data.arrivals.length > 0 && (
            <section aria-labelledby="new-title" className="mt-20 md:mt-28">
              <div className="container-page mb-6 flex items-end justify-between">
                <div>
                  <p className="eyebrow text-muted-foreground">Just landed</p>
                  <h2 id="new-title" className="mt-2 text-xl md:text-2xl">New in</h2>
                </div>
                <Link href="/new" className="text-sm underline underline-offset-4">
                  View all
                </Link>
              </div>
              <ProductShelf items={data.arrivals} label="New arrivals" />
            </section>
          )}

          {/* ---------------------------------------------------------------- editorial + shoppable denim */}
          <section aria-labelledby="denim-title" className="container-page mt-20 grid gap-8 md:mt-28 md:grid-cols-12 md:gap-6">
            <Link href="/collections/denim" className="group relative block aspect-[4/5] overflow-hidden bg-muted md:col-span-7 md:aspect-auto md:min-h-[720px]">
              <Image
                src={img("jeans/woman/jeans_03_3")}
                alt="Washed-black wide-leg jeans, seen from behind on the beach"
                fill
                sizes="(min-width: 768px) 58vw, 100vw"
                className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.02]"
              />
            </Link>
            <div className="flex flex-col md:col-span-5 md:py-6">
              <p className="eyebrow text-muted-foreground">The denim edit</p>
              <h2 id="denim-title" className="mt-3 text-[1.75rem] leading-tight tracking-[-0.02em] md:text-[2.25rem]">
                Wide, straight or cut-off — in washes from pale to black.
              </h2>
              <p className="mt-4 max-w-md text-sm text-muted-foreground">
                Five-pocket cotton denim for women and men. Every pair has its rise, leg shape and inseam listed on
                the product page.
              </p>
              <Link href="/collections/denim" className="mt-6 inline-flex items-center gap-2 text-sm underline underline-offset-4">
                Shop the denim edit <ArrowRight className="size-4" />
              </Link>
              {data.denim.length > 0 && (
                <ul className="mt-auto grid grid-cols-2 gap-x-[2px] gap-y-6 pt-10 sm:grid-cols-3">
                  {data.denim.map((p) => (
                    <li key={p.id}>
                      <ProductCard p={p} sizes="(min-width: 768px) 14vw, 50vw" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ---------------------------------------------------------------- categories */}
          <section aria-labelledby="cat-title" className="container-page mt-20 md:mt-28">
            <h2 id="cat-title" className="mb-6 text-xl md:text-2xl">Shop by category</h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
              {CATEGORIES.map((c, i) => (
                <li key={c.label} className={i === 0 ? "col-span-2 md:col-span-1" : undefined}>
                  <Link href={c.href} className="group block">
                    <div className={`relative overflow-hidden bg-muted ${i === 0 ? "aspect-[4/3] md:aspect-[3/4]" : "aspect-[3/4]"}`}>
                      <Image src={c.image} alt="" fill sizes="(min-width: 768px) 20vw, 50vw" className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]" />
                    </div>
                    <p className="mt-3 flex items-center gap-1 text-[0.9375rem]">
                      {c.label} <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------------------------------------------------------------- men */}
          {data.men.length > 0 && (
            <section aria-labelledby="men-title" className="mt-20 md:mt-28">
              <div className="grid md:grid-cols-2">
                <div className="relative aspect-[4/5] overflow-hidden bg-muted md:aspect-auto md:min-h-[640px]">
                  <Image
                    src={img("jeans/man/jeans_06_2")}
                    alt="Black straight-leg jeans with a white tee"
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover object-[50%_35%]"
                  />
                </div>
                <div className="flex flex-col justify-center px-4 py-10 md:px-12 lg:px-20">
                  <p className="eyebrow text-muted-foreground">Men</p>
                  <h2 id="men-title" className="mt-3 max-w-md text-[1.75rem] leading-tight tracking-[-0.02em] md:text-[2.25rem]">
                    Heavyweight tees and straight-leg denim.
                  </h2>
                  <ul className="mt-8 grid grid-cols-2 gap-x-[2px] gap-y-6">
                    {data.men.map((p) => (
                      <li key={p.id}>
                        <ProductCard p={p} sizes="(min-width: 768px) 22vw, 50vw" />
                      </li>
                    ))}
                  </ul>
                  <Link href="/men" className="mt-8 inline-flex items-center gap-2 text-sm underline underline-offset-4">
                    Shop all men <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- services */}
      <section aria-label="Shopping with Trestle" className="container-page mt-20 md:mt-28">
        <ul className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <li key={s.title} className="bg-background">
              <Link href={s.href} className="group flex h-full flex-col p-6 transition-colors hover:bg-muted/60">
                <s.icon className="size-5" strokeWidth={1.5} aria-hidden />
                <p className="mt-6 text-[0.9375rem]">{s.title}</p>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">{s.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
