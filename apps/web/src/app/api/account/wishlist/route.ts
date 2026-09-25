import { prisma } from "@trestle/db";
import { wishlistMutation } from "@/lib/schemas";
import { parseBody, route } from "@/server/http";
import { productCardSelect, toCard } from "@/server/catalog";

export const dynamic = "force-dynamic";

async function list(userId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { product: { select: productCardSelect } },
  });
  return {
    productIds: rows.map((r) => r.productId),
    items: rows.filter((r) => r.product.status === "ACTIVE").map((r) => toCard(r.product)),
  };
}

export const GET = route({ auth: "user" }, async ({ user }) => list(user!.id));

export const POST = route(
  { auth: "user", rateLimit: { bucket: "wishlist", limit: 120, windowSec: 60 } },
  async ({ req, user }) => {
    const m = await parseBody(req, wishlistMutation);
    const ids = m.op === "merge" ? m.productIds : [m.productId];
    if (m.op === "remove") {
      await prisma.wishlistItem.deleteMany({ where: { userId: user!.id, productId: m.productId } });
    } else {
      const existing = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      await prisma.wishlistItem.createMany({
        data: existing.map((p) => ({ userId: user!.id, productId: p.id })),
        skipDuplicates: true,
      });
    }
    return list(user!.id);
  },
);
