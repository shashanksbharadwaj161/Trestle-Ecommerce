import { prisma } from "@trestle/db";
import { productInput, productQuery } from "@/lib/schemas";
import { listCatalog } from "@/server/catalog";
import { createProduct } from "@/server/products";
import { badRequest, forbidden, parseBody, parseQuery, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(
  { rateLimit: { bucket: "products-read", limit: 240, windowSec: 60 } },
  async ({ req, user }) => {
    const q = parseQuery(req, productQuery);
    if (q.mine) {
      if (user?.role === "ADMIN") return listCatalog(q, { sellerId: q.seller ?? undefined, all: true });
      if (!user?.sellerId) throw forbidden("Seller account required");
      return listCatalog(q, { sellerId: user.sellerId });
    }
    return listCatalog(q);
  },
);

export const POST = route(
  { auth: "seller", rateLimit: { bucket: "products-write", limit: 30, windowSec: 60 } },
  async ({ req, user }) => {
    const input = await parseBody(req, productInput);
    let sellerId = user!.sellerId;
    // admins create products for a named seller (?seller=<slug|id>)
    const target = req.nextUrl.searchParams.get("seller");
    if (user!.role === "ADMIN" && target) {
      const s = await prisma.seller.findFirst({ where: { OR: [{ id: target }, { slug: target }] } });
      if (!s) throw badRequest("Unknown seller");
      sellerId = s.id;
    }
    if (!sellerId) throw forbidden("Complete seller onboarding first");
    return { product: await createProduct(input, user!, sellerId) };
  },
);
