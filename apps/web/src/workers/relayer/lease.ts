import type { PrismaClient } from "@trestle/db";

const LEASE_ID = "relayer-leader";

/**
 * Postgres-backed leader lease: acquire if free/expired or already ours; renew every tick.
 * Guarantees a single active relayer even if Render briefly runs two instances during a deploy.
 */
export async function acquireLease(
  prisma: PrismaClient,
  holder: string,
  ttlMs: number,
  info: Record<string, unknown>,
) {
  const expires = new Date(Date.now() + ttlMs);
  const rows = await prisma.$queryRaw<{ holder: string }[]>`
    INSERT INTO "RelayerLease" ("id", "holder", "expiresAt", "updatedAt", "info")
    VALUES (${LEASE_ID}, ${holder}, ${expires}, now(), ${JSON.stringify(info)}::jsonb)
    ON CONFLICT ("id") DO UPDATE
      SET "holder" = EXCLUDED."holder", "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = now(), "info" = EXCLUDED."info"
      WHERE "RelayerLease"."holder" = EXCLUDED."holder" OR "RelayerLease"."expiresAt" < now()
    RETURNING "holder"`;
  return rows.length === 1 && rows[0]!.holder === holder;
}

export async function releaseLease(prisma: PrismaClient, holder: string) {
  await prisma.relayerLease.deleteMany({ where: { id: LEASE_ID, holder } });
}
