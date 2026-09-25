import Image from "next/image";
import Link from "@/components/link";
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
  {
    label: "T-shirts",
    href: "/products?category=t-shirts",
    image: img("t-shirts/man/t-shirt_04_2"),
  },
  { label: "Jeans", href: "/products?category=jeans", image: img("jeans/woman/jeans_07_1") },
  { label: "Shorts", href: "/products?category=shorts", image: img("jeans/woman/jeans_13_2") },
  { label: "Knit hats", href: "/accessories", image: img("caps/cap_13_2") },
];

const SERVICES = [
  {
    icon: Box,
    title: "Free standard delivery",
    body: "On orders over $150. Express in 1–2 business days.",
    href: "/delivery",
  },
  {
    icon: RotateCcw,
    title: "30-day returns",
    body: "Request a return from your order page.",
    href: "/returns",
  },
  {
    icon: CreditCard,
    title: "Card or stablecoin",
    body: "Pay by card, or pay in stablecoins held in escrow.",
    href: "/payments",
  },
  {
    icon: LifeBuoy,
    title: "Help & sizing",
    body: "Size guides with measurements, care and contact.",
    href: "/help",
  },
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
      {/* lg+: type column + two images filling the first viewport; below lg the copy sits under the image */}
      <section
        aria-labelledby="hero-title"
        className="relative grid md:grid-cols-2 lg:h-[clamp(560px,calc(100svh-6.25rem),940px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="order-2 flex flex-col justify-end gap-7 px-4 py-10 md:col-span-2 md:px-6 md:py-14 lg:order-none lg:col-span-1 lg:px-10 lg:pb-14">
          <div>
            <p
              className="hero-in eyebrow text-muted-foreground"
              style={{ "--d": "380ms" } as React.CSSProperties}
            >
              The new season
            </p>
            <h1
              id="hero-title"
              className="mt-4 text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.96] tracking-[-0.04em] lg:text-[clamp(2.25rem,3.5vw,4rem)]"
            >
              <span className="hero-line">
                <span style={{ "--d": "180ms" } as React.CSSProperties}>Considered</span>
              </span>{" "}
              <span className="hero-line">
                <span style={{ "--d": "260ms" } as React.CSSProperties}>pieces, made</span>
              </span>{" "}
              <span className="hero-line">
                <span style={{ "--d": "340ms" } as React.CSSProperties}>to be worn often</span>
              </span>
            </h1>
            <p
              className="hero-in mt-5 max-w-sm text-[0.9375rem] text-muted-foreground"
              style={{ "--d": "520ms" } as React.CSSProperties}
            >
              Dresses, shirting, jersey and denim for women and men — cut to last, priced honestly,
              shipped with free 30‑day returns.
            </p>
          </div>
          <div
            className="hero-in flex flex-wrap gap-3"
            style={{ "--d": "640ms" } as React.CSSProperties}
          >
            <Link
              href="/women"
              className="btn-sheen inline-flex h-12 min-w-36 items-center justify-center bg-foreground px-7 text-sm text-background transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
            >
              Shop women
            </Link>
            <Link
              href="/men"
              className="inline-flex h-12 min-w-36 items-center justify-center border border-foreground px-7 text-sm transition-[background-color,color,transform] hover:bg-foreground hover:text-background active:scale-[0.98]"
            >
              Shop men
            </Link>
          </div>
        </div>
        <Link
          href="/new"
          className="hero-curtain group relative order-1 block aspect-[4/5] overflow-hidden bg-[#d9d9d7] lg:order-none lg:aspect-auto"
          style={{ "--d": "0ms" } as React.CSSProperties}
        >
          <Image
            src="/images/fashion-free/evening-editorial.jpg"
            alt="Editorial studio photograph: a model in a long black gown, backlit against a pale grey wall"
            fill
            priority
            sizes="(min-width: 1024px) 31vw, (min-width: 768px) 50vw, 100vw"
            className="hero-zoom object-cover object-[50%_55%] transition-transform duration-[1600ms] ease-out group-hover:scale-[1.02]"
          />
          {/* the studio photo is light in both themes, so the label keeps dark ink */}
          <span className="absolute left-3 top-3 text-[0.6875rem] text-[#171614]/75">
            Editorial · not a product
          </span>
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 bg-background/90 px-3 py-2 text-[0.8125rem] backdrop-blur transition-transform duration-500 group-hover:-translate-y-0.5">
            New in{" "}
            <ArrowRight
              className="size-3.5 transition-transform duration-500 group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </span>
        </Link>
        <Link
          href="/products/ribbon-tie-blouse"
          className="hero-curtain group relative order-1 hidden aspect-[4/5] overflow-hidden bg-[#f1f0ee] md:block lg:order-none lg:aspect-auto"
          style={{ "--d": "140ms" } as React.CSSProperties}
        >
          <Image
            src="/images/fashion-free/ivory-blouse.jpg"
            alt="The ivory ribbon-tie blouse, worn with the ribbon tied at the collar"
            fill
            priority
            sizes="(min-width: 1024px) 31vw, 50vw"
            className="hero-zoom object-cover object-[52%_35%] transition-transform duration-[1600ms] ease-out group-hover:scale-[1.02]"
          />
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 bg-background/90 px-3 py-2 text-[0.8125rem] backdrop-blur transition-transform duration-500 group-hover:-translate-y-0.5">
            Ribbon-tie blouse — $129
          </span>
        </Link>
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
            <section
              aria-labelledby="collections-title"
              className="reveal container-page mt-16 md:mt-24"
            >
              <div className="mb-6 flex items-end justify-between">
                <h2 id="collections-title" className="text-xl md:text-2xl">
                  Shop the collections
                </h2>
                <Link href="/collections" className="link-draw-on flex items-center gap-1 text-sm">
                  All collections
                </Link>
              </div>
              <ul className="reveal-stagger no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
                {data.collections.map((c, i) => (
                  <li
                    key={c.slug}
                    className="w-[72vw] shrink-0 snap-start sm:w-[44vw] md:w-auto"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <Link href={`/collections/${c.slug}`} className="group block">
                      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                        {c.image && (
                          <Image
                            src={c.image}
                            alt=""
                            fill
                            sizes="(min-width: 768px) 25vw, 72vw"
                            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
                          />
                        )}
                      </div>
                      <p className="mt-3 text-[0.9375rem]">{c.title}</p>
                      <p className="text-[0.8125rem] text-muted-foreground">
                        {c._count.products} pieces
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---------------------------------------------------------------- new in shelf */}
          {data.arrivals.length > 0 && (
            <section aria-labelledby="new-title" className="reveal mt-20 md:mt-28">
              <div className="container-page mb-6 flex items-end justify-between">
                <div>
                  <p className="eyebrow text-muted-foreground">Just landed</p>
                  <h2 id="new-title" className="mt-2 text-xl md:text-2xl">
                    New in
                  </h2>
                </div>
                <Link href="/new" className="link-draw-on text-sm">
                  View all
                </Link>
              </div>
              <ProductShelf items={data.arrivals} label="New arrivals" />
            </section>
          )}

          {/* ---------------------------------------------------------------- editorial + shoppable denim */}
          <section
            aria-labelledby="denim-title"
            className="reveal container-page mt-20 grid gap-8 md:mt-28 md:grid-cols-12 md:gap-6"
          >
            <Link
              href="/collections/denim"
              className="group relative block aspect-[4/5] overflow-hidden bg-muted md:col-span-7 md:aspect-auto md:min-h-[720px]"
            >
              <div className="parallax">
                <Image
                  src={img("jeans/woman/jeans_03_3")}
                  alt="Washed-black wide-leg jeans, seen from behind on the beach"
                  fill
                  sizes="(min-width: 768px) 58vw, 100vw"
                  className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.02]"
                />
              </div>
            </Link>
            <div className="flex flex-col md:col-span-5 md:py-6">
              <p className="eyebrow text-muted-foreground">The denim edit</p>
              <h2
                id="denim-title"
                className="mt-3 text-[1.75rem] leading-tight tracking-[-0.02em] md:text-[2.25rem]"
              >
                Wide, straight or cut-off — in washes from pale to black.
              </h2>
              <p className="mt-4 max-w-md text-sm text-muted-foreground">
                Five-pocket cotton denim for women and men. Every pair has its rise, leg shape and
                inseam listed on the product page.
              </p>
              <Link
                href="/collections/denim"
                className="group/l mt-6 inline-flex items-center gap-2 self-start text-sm"
              >
                <span className="link-draw-on">Shop the denim edit</span>{" "}
                <ArrowRight className="size-4 transition-transform duration-500 group-hover/l:translate-x-1" />
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
          <section aria-labelledby="cat-title" className="reveal container-page mt-20 md:mt-28">
            <h2 id="cat-title" className="mb-6 text-xl md:text-2xl">
              Shop by category
            </h2>
            <ul className="reveal-stagger grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
              {CATEGORIES.map((c, i) => (
                <li
                  key={c.label}
                  className={i === 0 ? "col-span-2 md:col-span-1" : undefined}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <Link href={c.href} className="group block">
                    <div
                      className={`relative overflow-hidden bg-muted ${i === 0 ? "aspect-[4/3] md:aspect-[3/4]" : "aspect-[3/4]"}`}
                    >
                      <Image
                        src={c.image}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 20vw, 50vw"
                        className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
                      />
                    </div>
                    <p className="mt-3 flex items-center gap-1 text-[0.9375rem]">
                      {c.label}{" "}
                      <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------------------------------------------------------------- men */}
          {data.men.length > 0 && (
            <section aria-labelledby="men-title" className="reveal mt-20 md:mt-28">
              <div className="grid md:grid-cols-2">
                <div className="relative aspect-[4/5] overflow-hidden bg-muted md:aspect-auto md:min-h-[640px]">
                  <div className="parallax">
                    <Image
                      src={img("jeans/man/jeans_06_2")}
                      alt="Black straight-leg jeans with a white tee"
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover object-[50%_35%]"
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-center px-4 py-10 md:px-12 lg:px-20">
                  <p className="eyebrow text-muted-foreground">Men</p>
                  <h2
                    id="men-title"
                    className="mt-3 max-w-md text-[1.75rem] leading-tight tracking-[-0.02em] md:text-[2.25rem]"
                  >
                    Heavyweight tees and straight-leg denim.
                  </h2>
                  <ul className="mt-8 grid grid-cols-2 gap-x-[2px] gap-y-6">
                    {data.men.map((p) => (
                      <li key={p.id}>
                        <ProductCard p={p} sizes="(min-width: 768px) 22vw, 50vw" />
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/men"
                    className="group/l mt-8 inline-flex items-center gap-2 self-start text-sm"
                  >
                    <span className="link-draw-on">Shop all men</span>{" "}
                    <ArrowRight className="size-4 transition-transform duration-500 group-hover/l:translate-x-1" />
                  </Link>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- services */}
      <section aria-label="Shopping with Trestle" className="reveal container-page mt-20 md:mt-28">
        <ul className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <li key={s.title} className="bg-background">
              <Link
                href={s.href}
                className="group flex h-full flex-col p-6 transition-colors hover:bg-muted/60"
              >
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
