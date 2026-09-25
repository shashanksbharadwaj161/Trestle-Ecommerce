import "server-only";
import { cache } from "react";
import { prisma, type Prisma } from "@trestle/db";
import { parseUsdToMicros, sortSizes, sizeRank } from "@trestle/shared";
import type { ProductQuery } from "@/lib/schemas";

export const NEW_ARRIVAL_DAYS = 45;
const newSince = () => new Date(Date.now() - NEW_ARRIVAL_DAYS * 86_400_000);

export const productCardSelect = {
  id: true,
  slug: true,
  title: true,
  priceUsdMicros: true,
  department: true,
  category: true,
  subcategory: true,
  featured: true,
  status: true,
  publishedAt: true,
  images: true,
  gallery: {
    select: { url: true, colour: true, alt: true, position: true },
    orderBy: { position: "asc" },
  },
  variants: {
    select: { id: true, colour: true, colourHex: true, size: true, stock: true, position: true },
    orderBy: { position: "asc" },
  },
} satisfies Prisma.ProductSelect;

export type ProductCardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

export interface CardColour {
  name: string;
  hex: string | null;
  image: string | null;
  /** second image of the same colour — only present when a real alternate exists */
  altImage: string | null;
  alt: string;
  inStock: boolean;
}

export interface ProductCard {
  id: string;
  slug: string;
  href: string;
  title: string;
  priceUsdMicros: bigint;
  department: string | null;
  category: string;
  subcategory: string | null;
  isNew: boolean;
  soldOut: boolean;
  status: string;
  colours: CardColour[];
  sizes: { size: string; variants: { colour: string; variantId: string; stock: number }[] }[];
}

export function toCard(p: ProductCardRow): ProductCard {
  const colourNames = [...new Set(p.variants.map((v) => v.colour ?? "Default"))];
  const colours: CardColour[] = colourNames.map((name) => {
    const imgs = p.gallery.filter((g) => g.colour === name);
    const fallback = p.gallery[0];
    const first = imgs[0] ?? fallback;
    return {
      name,
      hex: p.variants.find((v) => v.colour === name)?.colourHex ?? null,
      image: first?.url ?? p.images[0] ?? null,
      altImage: imgs[1]?.url ?? null,
      alt: first?.alt ?? p.title,
      inStock: p.variants.some((v) => (v.colour ?? "Default") === name && v.stock > 0),
    };
  });
  const sizeNames = sortSizes([...new Set(p.variants.map((v) => v.size ?? "One size"))]);
  return {
    id: p.id,
    slug: p.slug ?? p.id,
    href: `/products/${p.slug ?? p.id}`,
    title: p.title,
    priceUsdMicros: p.priceUsdMicros,
    department: p.department,
    category: p.category,
    subcategory: p.subcategory,
    isNew: p.publishedAt >= newSince(),
    soldOut: !p.variants.some((v) => v.stock > 0),
    status: p.status,
    colours,
    sizes: sizeNames.map((size) => ({
      size,
      variants: p.variants
        .filter((v) => (v.size ?? "One size") === size)
        .map((v) => ({ colour: v.colour ?? "Default", variantId: v.id, stock: v.stock })),
    })),
  };
}

type ListOpts = { sellerId?: string; /** admin view: every status */ all?: boolean };

function baseWhere(q: ProductQuery, opts: ListOpts): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (opts.sellerId) where.sellerId = opts.sellerId;
  if (!opts.sellerId && !opts.all) where.status = "ACTIVE";
  const and: Prisma.ProductWhereInput[] = [];
  if (q.q) {
    const terms = q.q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const t of terms) {
      and.push({
        OR: [
          { title: { contains: t, mode: "insensitive" } },
          { description: { contains: t, mode: "insensitive" } },
          { subcategory: { contains: t, mode: "insensitive" } },
          { category: { contains: t, mode: "insensitive" } },
          { variants: { some: { colour: { contains: t, mode: "insensitive" } } } },
        ],
      });
    }
  }
  if (q.department) {
    where.department = q.department;
  }
  if (q.collection) where.collections = { some: { collection: { slug: q.collection } } };
  if (q.new) where.publishedAt = { gte: newSince() };
  if (q.chain) where.chainListingOptions = { has: q.chain };
  if (q.seller && !opts.sellerId) where.seller = { OR: [{ id: q.seller }, { slug: q.seller }] };
  if (and.length) where.AND = and;
  return where;
}

function filteredWhere(q: ProductQuery, opts: ListOpts): Prisma.ProductWhereInput {
  const where = baseWhere(q, opts);
  const and = [...((where.AND as Prisma.ProductWhereInput[]) ?? [])];
  if (q.category?.length) and.push({ category: { in: q.category } });
  // colour + size must be satisfied by the SAME variant (e.g. "black in M, in stock"), not by two different ones
  if (q.colour?.length && q.size?.length)
    and.push({
      variants: { some: { colour: { in: q.colour }, size: { in: q.size }, stock: { gt: 0 } } },
    });
  else if (q.colour?.length) and.push({ variants: { some: { colour: { in: q.colour } } } });
  else if (q.size?.length)
    and.push({ variants: { some: { size: { in: q.size }, stock: { gt: 0 } } } });
  if (q.inStock) and.push({ variants: { some: { stock: { gt: 0 } } } });
  const price: Prisma.BigIntFilter = {};
  if (q.minPrice) price.gte = parseUsdToMicros(q.minPrice);
  if (q.maxPrice) price.lte = parseUsdToMicros(q.maxPrice);
  if (price.gte !== undefined || price.lte !== undefined) and.push({ priceUsdMicros: price });
  return { ...where, AND: and };
}

export async function listCatalog(q: ProductQuery, opts: ListOpts = {}) {
  const where = filteredWhere(q, opts);
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    q.sort === "price-asc"
      ? [{ priceUsdMicros: "asc" }]
      : q.sort === "price-desc"
        ? [{ priceUsdMicros: "desc" }]
        : q.sort === "newest"
          ? [{ publishedAt: "desc" }]
          : [{ featured: "desc" }, { publishedAt: "desc" }];
  const [total, rows, facets] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [...orderBy, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: productCardSelect,
    }),
    facetsFor(baseWhere(q, opts)),
  ]);
  return {
    items: rows.map(toCard),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    facets,
  };
}

/** Facet values available within the current scope (department / collection / search / new). */
async function facetsFor(where: Prisma.ProductWhereInput) {
  const [cats, variants, price] = await Promise.all([
    prisma.product.groupBy({ by: ["category"], where, _count: { _all: true } }),
    prisma.productVariant.findMany({
      where: { product: where },
      select: { colour: true, colourHex: true, size: true, stock: true, productId: true },
    }),
    prisma.product.aggregate({
      where,
      _min: { priceUsdMicros: true },
      _max: { priceUsdMicros: true },
    }),
  ]);
  const colourMap = new Map<string, { hex: string | null; products: Set<string> }>();
  const sizeSet = new Set<string>();
  for (const v of variants) {
    if (v.colour) {
      const c = colourMap.get(v.colour) ?? { hex: v.colourHex, products: new Set<string>() };
      c.products.add(v.productId);
      colourMap.set(v.colour, c);
    }
    if (v.size) sizeSet.add(v.size);
  }
  return {
    categories: cats
      .map((c) => ({ value: c.category, count: c._count._all }))
      .sort((a, b) => a.value.localeCompare(b.value)),
    colours: [...colourMap.entries()]
      .map(([value, c]) => ({ value, hex: c.hex, count: c.products.size }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    sizes: [...sizeSet].sort((a, b) => sizeRank(a) - sizeRank(b)),
    price: {
      min: price._min.priceUsdMicros ?? 0n,
      max: price._max.priceUsdMicros ?? 0n,
    },
  };
}

async function loadProductDetail(slugOrId: string) {
  const product = await prisma.product.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    include: {
      seller: {
        select: {
          id: true,
          storefrontName: true,
          slug: true,
          verified: true,
          payoutChainId: true,
          user: { select: { walletAddress: true, reputationScoreCache: true } },
        },
      },
      gallery: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
      certificates: { orderBy: { createdAt: "asc" } },
      collections: { include: { collection: { select: { slug: true, title: true } } } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { author: { select: { displayName: true } } },
      },
    },
  });
  if (!product) return null;
  const agg = await prisma.review.aggregate({
    where: { productId: product.id },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    ...product,
    isNew: product.publishedAt >= newSince(),
    rating: { avg: agg._avg.rating ?? 0, count: agg._count._all },
  };
}

/** Request-deduplicated: generateMetadata and the page share one query. */
export const getProductDetail = cache(loadProductDetail);
export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

/** "You may also like": same department + category, then same department. */
export async function relatedProducts(p: {
  id: string;
  department: string | null;
  category: string;
}) {
  const rows = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      id: { not: p.id },
      department: p.department ?? undefined,
    },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    take: 24,
    select: productCardSelect,
  });
  const same = rows.filter((r) => r.category === p.category);
  const other = rows.filter((r) => r.category !== p.category);
  return [...same, ...other].slice(0, 8).map(toCard);
}

export async function listCollections() {
  return prisma.collection.findMany({
    where: { published: true },
    orderBy: { position: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

export async function getCollection(slug: string) {
  return prisma.collection.findFirst({ where: { slug, published: true } });
}

export async function productCards(
  where: Prisma.ProductWhereInput,
  take: number,
  orderBy?: Prisma.ProductOrderByWithRelationInput[],
) {
  const rows = await prisma.product.findMany({
    where: { status: "ACTIVE", ...where },
    orderBy: [...(orderBy ?? [{ featured: "desc" }, { publishedAt: "desc" }]), { id: "asc" }],
    take,
    select: productCardSelect,
  });
  return rows.map(toCard);
}

export async function newArrivals(take = 12) {
  return productCards({ publishedAt: { gte: newSince() } }, take, [{ publishedAt: "desc" }]);
}
