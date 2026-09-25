import { prisma } from "@trestle/db";
import { isDeployed } from "@trestle/shared";
import { env } from "@/server/env";
import { kv } from "@/server/kv";
import { chainProfiles, publicClient } from "@/server/chain";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Liveness + dependency health for Vercel/Render checks. 200 only when DB and KV are reachable. */
export async function GET() {
  const e = env();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, detail: (err as Error).message.slice(0, 120) };
  }
  try {
    const store = kv();
    await store.set("health:ping", String(Date.now()), { ex: 30 });
    checks.kv = { ok: (await store.get("health:ping")) !== null, detail: store.kind };
  } catch (err) {
    checks.kv = { ok: false, detail: (err as Error).message.slice(0, 120) };
  }
  for (const p of chainProfiles()) {
    try {
      const block = await publicClient(p.chain.id).getBlockNumber();
      checks[`chain_${p.chain.id}`] = { ok: true, detail: `block ${block}` };
    } catch {
      checks[`chain_${p.chain.id}`] = { ok: false, detail: "rpc unreachable" };
    }
  }
  checks.contracts = {
    ok: isDeployed(e.mode),
    detail: isDeployed(e.mode) ? "addresses loaded" : `no ${e.mode} deployment`,
  };
  const ok = checks.database!.ok && checks.kv!.ok;
  // non-secret runtime facts for diagnosing speed issues (no hosts, users or credentials)
  let pool: Record<string, string | null> = {};
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    pool = {
      connectionLimit: u.searchParams.get("connection_limit"),
      pgbouncer: u.searchParams.get("pgbouncer"),
      port: u.port || null,
    };
  } catch {
    /* no URL */
  }
  const runtime = {
    region: process.env.VERCEL_REGION ?? null,
    ...pool,
  };
  return json(
    { ok, network: e.mode, checks, runtime, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
