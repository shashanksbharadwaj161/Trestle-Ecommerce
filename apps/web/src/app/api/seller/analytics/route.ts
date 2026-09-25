import { prisma } from "@trestle/db";
import { forbidden, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "seller" }, async ({ user }) => {
  if (!user!.sellerId) throw forbidden("Seller account required");
  const seller = await prisma.seller.findUniqueOrThrow({ where: { id: user!.sellerId } });
  const since = new Date(Date.now() - 60 * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { sellerId: seller.id, createdAt: { gte: since } },
    select: {
      id: true,
      status: true,
      subtotalUsdMicros: true,
      createdAt: true,
      isSeedDemo: true,
      items: { select: { titleSnapshot: true, quantity: true, productId: true } },
      dispute: { select: { status: true, buyerShareBps: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const paid = orders.filter((o) => !["PENDING_PAYMENT", "CANCELLED"].includes(o.status));
  const byDay = new Map<string, { date: string; revenueUsdMicros: bigint; orders: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(d, { date: d, revenueUsdMicros: 0n, orders: 0 });
  }
  for (const o of paid) {
    const d = o.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(d);
    if (row) {
      row.revenueUsdMicros += o.subtotalUsdMicros;
      row.orders += 1;
    }
  }
  const products = new Map<string, { title: string; units: number }>();
  for (const o of paid)
    for (const it of o.items) {
      const p = products.get(it.productId) ?? { title: it.titleSnapshot, units: 0 };
      p.units += it.quantity;
      products.set(it.productId, p);
    }
  const statusCounts: Record<string, number> = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
  const disputed = paid.filter((o) => o.dispute).length;
  const repEvents = await prisma.reputationEvent.findMany({
    where: { address: seller.payoutAddress },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      newScore: true,
      eventType: true,
      weight: true,
      chainId: true,
      isSeedDemo: true,
    },
  });
  return {
    revenueUsdMicros: paid.reduce((s, o) => s + o.subtotalUsdMicros, 0n),
    paidOrders: paid.length,
    averageOrderUsdMicros: paid.length
      ? paid.reduce((s, o) => s + o.subtotalUsdMicros, 0n) / BigInt(paid.length)
      : 0n,
    disputeRate: paid.length ? disputed / paid.length : 0,
    statusCounts,
    daily: [...byDay.values()],
    topProducts: [...products.entries()]
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5),
    reputationTrend: repEvents.map((e) => ({
      at: e.createdAt,
      score: Number(e.newScore),
      eventType: e.eventType,
      weight: e.weight,
      isSeedDemo: e.isSeedDemo,
    })),
    includesSeedDemo: orders.some((o) => o.isSeedDemo),
  };
});
