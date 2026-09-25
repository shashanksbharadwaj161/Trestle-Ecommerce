import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepExpiredCardPayments } from "@/server/card-checkout";
import { cardConfig } from "@/server/stripe";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Releases stock held by abandoned card checkouts. Vercel Cron sends Authorization: Bearer $CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const ok =
    !!secret &&
    auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!cardConfig().enabled) return NextResponse.json({ skipped: "card payments not configured" });
  return NextResponse.json(await sweepExpiredCardPayments(100));
}
