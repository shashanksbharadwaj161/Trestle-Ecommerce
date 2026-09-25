import "server-only";
import { prisma, type Prisma } from "@trestle/db";
import { parseUsdToMicros, SIZE_CHARTS } from "@trestle/shared";
import type { ProductInput } from "@/lib/schemas";
import { badRequest, conflict, forbidden, notFound } from "./http";
import { supportedChainIds } from "./chain";
import type { AuthedUser } from "./session";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);

async function uniqueSlug(title: string, excludeId?: string) {
  const base = slugify(title) || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!hit || hit.id === excludeId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Sellers manage their own products; admins manage every product. */
export async function productForEditor(id: string, user: AuthedUser) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { position: "asc" } },
      gallery: { orderBy: { position: "asc" } },
      collections: { include: { collection: { select: { slug: true } } } },
    },
  });
  if (!p) throw notFound("Product");
  if (user.role !== "ADMIN" && (!user.sellerId || p.sellerId !== user.sellerId))
    throw forbidden("You can only manage your own products");
  return p;
}

function validate(input: ProductInput) {
  const chains = supportedChainIds();
  if (input.chainListingOptions.some((c) => !chains.includes(c)))
    throw badRequest("Unsupported chain in chainListingOptions");
  const skus = input.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) throw badRequest("Variant SKUs must be unique");
  const combos = input.variants.map((v) => `${v.colour.toLowerCase()}/${v.size.toLowerCase()}`);
  if (new Set(combos).size !== combos.length)
    throw badRequest("Each colour/size combination may only appear once");
  if (input.sizeChartKey && !SIZE_CHARTS[input.sizeChartKey]) throw badRequest("Unknown size chart");
}

function productData(input: ProductInput) {
  return {
    title: input.title,
    description: input.description,
    images: input.images.map((i) => i.url),
    priceUsdMicros: parseUsdToMicros(input.price),
    department: input.department,
    category: input.category,
    subcategory: input.subcategory ?? null,
    material: input.material ?? null,
    fit: input.fit ?? null,
    care: input.care,
    sizeChartKey: input.sizeChartKey ?? null,
    chainListingOptions: input.chainListingOptions,
    status: input.status,
    featured: input.featured ?? false,
  } satisfies Prisma.ProductUncheckedUpdateInput;
}

async function syncChildren(tx: Prisma.TransactionClient, productId: string, input: ProductInput) {
  await tx.productImage.deleteMany({ where: { productId } });
  await tx.productImage.createMany({
    data: input.images.map((img, position) => ({
      productId,
      url: img.url,
      alt: img.alt,
      colour: img.colour ?? null,
      credit: img.credit ?? null,
      license: img.license ?? null,
      sourceUrl: img.sourceUrl ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      position,
    })),
  });
  const cols = await tx.collection.findMany({
    where: { slug: { in: input.collections } },
    select: { id: true },
  });
  await tx.collectionProduct.deleteMany({ where: { productId } });
  await tx.collectionProduct.createMany({
    data: cols.map((c) => ({ collectionId: c.id, productId })),
    skipDuplicates: true,
  });
}

export async function createProduct(input: ProductInput, user: AuthedUser, sellerId: string) {
  validate(input);
  const skus = input.variants.map((v) => v.sku);
  const taken = await prisma.productVariant.findFirst({
    where: { sku: { in: skus } },
    select: { sku: true },
  });
  if (taken) throw conflict(`SKU ${taken.sku} is already in use`);
  const slug = await uniqueSlug(input.title);
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        ...productData(input),
        sellerId,
        slug,
        variants: {
          create: input.variants.map((v, position) => ({
            name: `${v.colour} / ${v.size}`,
            sku: v.sku,
            stock: v.stock,
            colour: v.colour,
            colourHex: v.colourHex ?? null,
            size: v.size,
            position,
            attributes: { colour: v.colour, size: v.size },
          })),
        },
      },
    });
    await syncChildren(tx, p.id, input);
    return p;
  });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "product.create", entity: "Product", entityId: product.id },
  });
  return productForEditor(product.id, user);
}

export async function updateProduct(id: string, input: ProductInput, user: AuthedUser) {
  const existing = await productForEditor(id, user);
  validate(input);
  const skus = input.variants.map((v) => v.sku);
  const taken = await prisma.productVariant.findFirst({
    where: { sku: { in: skus }, productId: { not: existing.id } },
    select: { sku: true },
  });
  if (taken) throw conflict(`SKU ${taken.sku} is already in use`);
  const keepIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id!));
  for (const vid of keepIds)
    if (!existing.variants.some((v) => v.id === vid)) throw badRequest("Unknown variant id");

  await prisma.$transaction(async (tx) => {
    for (const v of existing.variants.filter((v) => !keepIds.has(v.id))) {
      const used = await tx.orderItem.count({ where: { productVariantId: v.id } });
      // variants referenced by orders are retired (stock 0), never deleted
      if (used > 0) await tx.productVariant.update({ where: { id: v.id }, data: { stock: 0 } });
      else await tx.productVariant.delete({ where: { id: v.id } });
    }
    // two passes so SKUs can be swapped between variants without tripping the unique index
    for (const v of input.variants.filter((v) => v.id))
      await tx.productVariant.update({ where: { id: v.id }, data: { sku: `TMP-${v.id}` } });
    for (const [position, v] of input.variants.entries()) {
      const data = {
        name: `${v.colour} / ${v.size}`,
        sku: v.sku,
        stock: v.stock,
        colour: v.colour,
        colourHex: v.colourHex ?? null,
        size: v.size,
        position,
        attributes: { colour: v.colour, size: v.size },
      };
      if (v.id) await tx.productVariant.update({ where: { id: v.id }, data });
      else await tx.productVariant.create({ data: { ...data, productId: existing.id } });
    }
    await tx.product.update({ where: { id: existing.id }, data: productData(input) });
    await syncChildren(tx, existing.id, input);
  });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "product.update", entity: "Product", entityId: existing.id },
  });
  return productForEditor(existing.id, user);
}

export async function deleteProduct(id: string, user: AuthedUser) {
  const p = await productForEditor(id, user);
  const orders = await prisma.orderItem.count({ where: { productId: p.id } });
  if (orders > 0) {
    await prisma.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    return {
      archived: true,
      deleted: false,
      reason: "Product has order history, so it was archived instead of deleted.",
    };
  }
  await prisma.product.delete({ where: { id: p.id } });
  return { archived: false, deleted: true };
}

/** Bulk stock edit (inventory screen). */
export async function setStock(
  productId: string,
  variants: { id: string; stock: number }[],
  user: AuthedUser,
) {
  const p = await productForEditor(productId, user);
  const ids = new Set(p.variants.map((v) => v.id));
  if (variants.some((v) => !ids.has(v.id))) throw badRequest("Unknown variant id");
  await prisma.$transaction(
    variants.map((v) => prisma.productVariant.update({ where: { id: v.id }, data: { stock: v.stock } })),
  );
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "product.stock",
      entity: "Product",
      entityId: productId,
      data: { variants },
    },
  });
  return productForEditor(productId, user);
}
