import "server-only";
import { prisma, type Prisma } from "@trestle/db";
import { parseUsdToMicros } from "@trestle/shared";
import type { ProductQuery } from "@/lib/schemas";

export const productCardSelect = {
  id: true,
  title: true,
  images: true,
  priceUsdMicros: true,
  category: true,
  featured: true,
  status: true,
  chainListingOptions: true,
  createdAt: true,
  manufacturer: true,
  seller: {
    select: { id: true, storefrontName: true, slug: true, verified: true, payoutChainId: true },
  },
  variants: { select: { id: true, name: true, stock: true } },
  _count: { select: { certificates: true, reviews: true } },
} satisfies Prisma.ProductSelect;

export type ProductCardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

export async function ratingsFor(
  productIds: string[],
): Promise<Map<string, { avg: number; count: number }>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.productId, { avg: r._avg.rating ?? 0, count: r._count._all }]));
}

export async function listProducts(q: ProductQuery, opts: { sellerId?: string } = {}) {
  const where: Prisma.ProductWhereInput = {};
  if (opts.sellerId) where.sellerId = opts.sellerId;
  else where.status = "ACTIVE";
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: "insensitive" } },
      { description: { contains: q.q, mode: "insensitive" } },
      { manufacturer: { contains: q.q, mode: "insensitive" } },
    ];
  }
  if (q.category) where.category = q.category;
  if (q.chain) where.chainListingOptions = { has: q.chain };
  if (q.seller) where.seller = { OR: [{ id: q.seller }, { slug: q.seller }] };
  const price: Prisma.BigIntFilter = {};
  if (q.minPrice) price.gte = parseUsdToMicros(q.minPrice);
  if (q.maxPrice) price.lte = parseUsdToMicros(q.maxPrice);
  if (price.gte !== undefined || price.lte !== undefined) where.priceUsdMicros = price;

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    q.sort === "price-asc"
      ? [{ priceUsdMicros: "asc" }]
      : q.sort === "price-desc"
        ? [{ priceUsdMicros: "desc" }]
        : q.sort === "newest"
          ? [{ createdAt: "desc" }]
          : q.sort === "rating"
            ? [{ reviews: { _count: "desc" } }, { createdAt: "desc" }]
            : [{ featured: "desc" }, { createdAt: "desc" }];

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [...orderBy, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: productCardSelect,
    }),
  ]);
  const ratings = await ratingsFor(rows.map((r) => r.id));
  return {
    items: rows.map((r) => ({ ...r, rating: ratings.get(r.id) ?? { avg: 0, count: 0 } })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      seller: {
        include: { user: { select: { walletAddress: true, reputationScoreCache: true } } },
      },
      variants: { orderBy: { sku: "asc" } },
      certificates: { orderBy: { createdAt: "asc" } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { author: { select: { displayName: true, walletAddress: true } } },
      },
    },
  });
  if (!product) return null;
  const rating = (await ratingsFor([id])).get(id) ?? { avg: 0, count: 0 };
  return { ...product, rating };
}

export async function categoriesWithCounts() {
  const rows = await prisma.product.groupBy({
    by: ["category"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ category: r.category, count: r._count._all }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
