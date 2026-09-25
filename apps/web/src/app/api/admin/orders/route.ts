import { z } from "zod";
import { prisma, type Prisma } from "@trestle/db";
import { parseQuery, route } from "@/server/http";

export const dynamic = "force-dynamic";

const q = z.object({
  method: z.enum(["CARD", "CRYPTO"]).optional(),
  status: z.string().max(30).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const GET = route({ auth: "admin" }, async ({ req }) => {
  const query = parseQuery(req, q);
  const where: Prisma.OrderWhereInput = {};
  if (query.method) where.paymentMethod = query.method;
  if (query.status) where.status = query.status as Prisma.OrderWhereInput["status"];
  if (query.q)
    where.OR = [
      { id: { contains: query.q } },
      { trackingNumber: { contains: query.q } },
      { cardPayment: { email: { contains: query.q, mode: "insensitive" } } },
      { cardPaymentId: { contains: query.q } },
    ];
  const take = 25;
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * take,
      take,
      include: {
        items: { select: { titleSnapshot: true, variantSnapshot: true, quantity: true, imageSnapshot: true } },
        seller: { select: { storefrontName: true } },
        buyer: { select: { displayName: true, email: true, walletAddress: true } },
        cardPayment: {
          select: { id: true, status: true, email: true, totalCents: true, refundedCents: true, shippingMethod: true, failureReason: true },
        },
        returnRequests: { select: { id: true, status: true } },
        dispute: { select: { status: true } },
      },
    }),
  ]);
  return { items, total, page: query.page, pageCount: Math.max(1, Math.ceil(total / take)) };
});
