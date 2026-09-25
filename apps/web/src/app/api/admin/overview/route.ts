import { prisma } from "@trestle/db";
import { route } from "@/server/http";
import { cardConfig } from "@/server/stripe";

export const dynamic = "force-dynamic";

/** Operational overview: what needs attention now. */
export const GET = route({ auth: "admin" }, async () => {
  const [toShip, byStatus, attention, openReturns, messages, lowStock, soldOut, products, sellers] = await Promise.all([
    prisma.order.count({ where: { status: "PROCESSING" } }),
    prisma.order.groupBy({ by: ["paymentMethod", "status"], _count: { _all: true } }),
    prisma.cardPayment.findMany({
      where: { failureReason: { not: null }, status: { in: ["PAID", "OPEN", "PROCESSING"] } },
      select: { id: true, status: true, failureReason: true, createdAt: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    prisma.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] } } }),
    prisma.contactMessage.count({ where: { handled: false } }),
    prisma.productVariant.count({ where: { stock: { gt: 0, lte: 3 }, product: { status: "ACTIVE" } } }),
    prisma.productVariant.count({ where: { stock: 0, product: { status: "ACTIVE" } } }),
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.seller.count(),
  ]);
  return {
    card: cardConfig(),
    toShip,
    orders: byStatus.map((r) => ({ method: r.paymentMethod, status: r.status, count: r._count._all })),
    attention,
    openReturns,
    unreadMessages: messages,
    lowStockSkus: lowStock,
    soldOutSkus: soldOut,
    products: products.map((p) => ({ status: p.status, count: p._count._all })),
    sellers,
  };
});
