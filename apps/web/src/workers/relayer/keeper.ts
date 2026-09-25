import type { PrismaClient } from "@trestle/db";
import { fetchTransactionEvents } from "@trestle/db/sync";
import { trestleEscrowAbi } from "@trestle/shared/abis";
import type { RelayerConfig } from "./config";
import type { ChainCtx } from "./clients";
import { deliverEvents } from "./deliver";
import { log } from "./log";

/** Anyone may call TrestleEscrow.autoRelease after the delivery deadline; the relayer does it as a keeper. */
export async function autoReleaseDue(cfg: RelayerConfig, prisma: PrismaClient, chains: Map<number, ChainCtx>) {
  if (!cfg.autoRelease) return;
  const due = await prisma.order.findMany({
    where: {
      isSeedDemo: false,
      escrowContractOrderId: { not: null },
      status: { in: ["ESCROWED", "SHIPPED", "DELIVERED"] },
      deliveryDeadline: { lt: new Date(Date.now() - 5_000) },
    },
    take: 10,
  });
  for (const o of due) {
    const ctx = chains.get(o.escrowChainId!);
    if (!ctx) continue;
    try {
      const onchain = (await ctx.client.readContract({
        address: ctx.dep.escrow,
        abi: trestleEscrowAbi,
        functionName: "getOrder",
        args: [BigInt(o.escrowContractOrderId!)],
      })) as { status: number; deliveryDeadline: bigint };
      const block = await ctx.client.getBlock();
      if (onchain.status !== 1 || block.timestamp <= onchain.deliveryDeadline) continue;
      const { request } = await ctx.client.simulateContract({
        address: ctx.dep.escrow,
        abi: trestleEscrowAbi,
        functionName: "autoRelease",
        args: [BigInt(o.escrowContractOrderId!)],
        account: ctx.wallet.account,
      });
      const hash = await ctx.wallet.writeContract(request as never);
      await ctx.client.waitForTransactionReceipt({ hash });
      const { events } = await fetchTransactionEvents(ctx.client, cfg.mode, ctx.chainId, hash);
      await deliverEvents(cfg, prisma, events);
      log.info("auto-released escrow after deadline", { orderId: o.id, tx: hash });
    } catch (err) {
      log.warn("auto-release failed", { orderId: o.id, err: (err as Error).message });
    }
  }
}

/** Releases stock held by checkouts that never reached the chain before their reservation expired. */
export async function sweepExpiredReservations(prisma: PrismaClient) {
  const stale = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      reservationExpiresAt: { lt: new Date() },
      paymentIntents: { none: { OR: [{ onchainIntentId: { not: null } }, { sourceTxHash: { not: null } }] } },
    },
    include: { items: true },
    take: 50,
  });
  for (const o of stale) {
    await prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: o.id, status: "PENDING_PAYMENT", stockReleased: false },
        data: { status: "CANCELLED", stockReleased: true },
      });
      if (res.count !== 1) return;
      for (const it of o.items) {
        await tx.productVariant.update({ where: { id: it.productVariantId }, data: { stock: { increment: it.quantity } } });
      }
      await tx.paymentIntent.updateMany({
        where: { orderId: o.id, status: "CREATED" },
        data: { status: "FAILED", failureReason: "payment not received before reservation expired" },
      });
    });
    log.info("released expired reservation", { orderId: o.id });
  }
}
