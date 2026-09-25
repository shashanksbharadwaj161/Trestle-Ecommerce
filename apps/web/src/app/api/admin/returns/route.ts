import { prisma } from "@trestle/db";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async () => {
  const items = await prisma.returnRequest.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      order: {
        select: {
          id: true,
          cardPaymentId: true,
          items: { select: { id: true, titleSnapshot: true, variantSnapshot: true, quantity: true, unitPriceUsdMicros: true, imageSnapshot: true } },
          cardPayment: { select: { email: true, totalCents: true, refundedCents: true } },
        },
      },
    },
  });
  return { items };
});
