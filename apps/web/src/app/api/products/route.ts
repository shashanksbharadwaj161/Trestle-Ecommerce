import { prisma } from "@trestle/db";
import { parseUsdToMicros } from "@trestle/shared";
import { productInput, productQuery } from "@/lib/schemas";
import { listProducts } from "@/server/products";
import { badRequest, conflict, forbidden, parseBody, parseQuery, route } from "@/server/http";
import { supportedChainIds } from "@/server/chain";

export const dynamic = "force-dynamic";

export const GET = route(
  { rateLimit: { bucket: "products-read", limit: 240, windowSec: 60 } },
  async ({ req, user }) => {
    const q = parseQuery(req, productQuery);
    if (q.mine) {
      if (!user?.sellerId) throw forbidden("Seller account required");
      return listProducts(q, { sellerId: user.sellerId });
    }
    return listProducts(q);
  },
);

export const POST = route(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 30, windowSec: 60 } },
  async ({ req, user }) => {
    if (!user!.sellerId) throw forbidden("Complete seller onboarding first");
    const input = await parseBody(req, productInput);
    const chains = supportedChainIds();
    if (input.chainListingOptions.some((c) => !chains.includes(c)))
      throw badRequest("Unsupported chain in chainListingOptions");
    const skus = input.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw badRequest("Variant SKUs must be unique");
    const taken = await prisma.productVariant.findFirst({
      where: { sku: { in: skus } },
      select: { sku: true },
    });
    if (taken) throw conflict(`SKU ${taken.sku} is already in use`);
    const product = await prisma.product.create({
      data: {
        sellerId: user!.sellerId,
        title: input.title,
        description: input.description,
        images: input.images,
        priceUsdMicros: parseUsdToMicros(input.price),
        category: input.category,
        chainListingOptions: input.chainListingOptions,
        status: input.status,
        manufacturer: input.manufacturer ?? null,
        variants: {
          create: input.variants.map((v) => ({
            name: v.name,
            sku: v.sku,
            stock: v.stock,
            attributes: v.attributes,
          })),
        },
      },
      include: { variants: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user!.id,
        action: "product.create",
        entity: "Product",
        entityId: product.id,
        data: {},
      },
    });
    return { product };
  },
);
