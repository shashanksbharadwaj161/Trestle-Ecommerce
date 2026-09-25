import { productInput } from "@/lib/schemas";
import { getProductDetail } from "@/server/catalog";
import { deleteProduct, productForEditor, updateProduct } from "@/server/products";
import { notFound, parseBody, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>({}, async ({ req, params, user }) => {
  // editors get the raw editable record
  if (req.nextUrl.searchParams.get("edit") === "1" && user) {
    return { product: await productForEditor(params.id, user) };
  }
  const product = await getProductDetail(params.id);
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
        reputationScore: seller.user.reputationScoreCache,
      },
    },
  };
});

export const PATCH = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 60, windowSec: 60 } },
  async ({ req, params, user }) => {
    const input = await parseBody(req, productInput);
    return { product: await updateProduct(params.id, input, user!) };
  },
);

export const DELETE = route<{ id: string }>(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 30, windowSec: 60 } },
  async ({ params, user }) => deleteProduct(params.id, user!),
);
