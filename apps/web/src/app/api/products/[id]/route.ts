import { prisma } from "@trestle/db";
import { parseUsdToMicros } from "@trestle/shared";
import { productInput } from "@/lib/schemas";
import { getProduct } from "@/server/products";
import { badRequest, conflict, forbidden, notFound, parseBody, route } from "@/server/http";
import { supportedChainIds } from "@/server/chain";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({}, async ({ params, user }) => {
  const product = await getProduct(params.id);
  if (!product) throw notFound("Product");
  const owner = user?.sellerId === product.sellerId;
  if (product.status !== "ACTIVE" && !owner && user?.role !== "ADMIN") throw notFound("Product");
  // never leak seller internals publicly
  const { seller, ...rest } = product;
  return {
    product: {
      ...rest,
      seller: {
        id: seller.id,
        storefrontName: seller.storefrontName,
        slug: seller.slug,
        verified: seller.verified,
        payoutChainId: seller.payoutChainId,
        payoutAddress: seller.payoutAddress,
        reputationScore: seller.user.reputationScoreCache,
      },
    },
  };
});

async function ownedProduct(id: string, sellerId: string | null) {
  const p = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!p) throw notFound("Product");
  if (!sellerId || p.sellerId !== sellerId) throw forbidden("You can only manage your own products");
  return p;
}

export const PATCH = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 60, windowSec: 60 } },
  async ({ req, params, user }) => {
    const existing = await ownedProduct(params.id, user!.sellerId);
    const input = await parseBody(req, productInput);
    const chains = supportedChainIds();
    if (input.chainListingOptions.some((c) => !chains.includes(c))) throw badRequest("Unsupported chain in chainListingOptions");
    const skus = input.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw badRequest("Variant SKUs must be unique");
    const taken = await prisma.productVariant.findFirst({
      where: { sku: { in: skus }, productId: { not: existing.id } },
      select: { sku: true },
    });
    if (taken) throw conflict(`SKU ${taken.sku} is already in use`);

    const keepIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id!));
    for (const id of keepIds) {
      if (!existing.variants.some((v) => v.id === id)) throw badRequest("Unknown variant id");
    }
    const product = await prisma.$transaction(async (tx) => {
      for (const v of existing.variants.filter((v) => !keepIds.has(v.id))) {
        const used = await tx.orderItem.count({ where: { productVariantId: v.id } });
        // variants referenced by orders are retired (stock 0), never deleted
        if (used > 0) await tx.productVariant.update({ where: { id: v.id }, data: { stock: 0 } });
        else await tx.productVariant.delete({ where: { id: v.id } });
      }
      for (const v of input.variants) {
        if (v.id) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: { name: v.name, sku: v.sku, stock: v.stock, attributes: v.attributes },
          });
        } else {
          await tx.productVariant.create({
            data: { productId: existing.id, name: v.name, sku: v.sku, stock: v.stock, attributes: v.attributes },
          });
        }
      }
      return tx.product.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          description: input.description,
          images: input.images,
          priceUsdMicros: parseUsdToMicros(input.price),
          category: input.category,
          chainListingOptions: input.chainListingOptions,
          status: input.status,
          manufacturer: input.manufacturer ?? null,
        },
        include: { variants: { orderBy: { sku: "asc" } } },
      });
    });
    await prisma.auditLog.create({
      data: { actorId: user!.id, action: "product.update", entity: "Product", entityId: product.id, data: {} },
    });
    return { product };
  },
);

export const DELETE = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 30, windowSec: 60 } },
  async ({ params, user }) => {
    const p = await ownedProduct(params.id, user!.sellerId);
    const orders = await prisma.orderItem.count({ where: { productId: p.id } });
    if (orders > 0) {
      await prisma.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
      return { archived: true, deleted: false, reason: "Product has order history, so it was archived instead of deleted." };
    }
    await prisma.product.delete({ where: { id: p.id } });
    return { archived: false, deleted: true };
  },
);
