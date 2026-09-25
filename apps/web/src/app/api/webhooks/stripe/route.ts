import { NextResponse, type NextRequest } from "next/server";
import { applyStripeEvent } from "@/server/card-checkout";
import { cardConfig, verifyWebhook } from "@/server/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook — the single source of truth for card payment status.
 * The raw body is verified against Stripe-Signature before anything is parsed or applied.
 * Returns 400 on bad signatures (Stripe will retry), 500 on processing errors (Stripe retries),
 * 200 for applied, ignored and duplicate events.
 */
export async function POST(req: NextRequest) {
  if (!cardConfig().enabled)
    return NextResponse.json({ error: "card payments not configured" }, { status: 503 });
  const raw = await req.text();
  let event;
  try {
    event = verifyWebhook(raw, req.headers.get("stripe-signature"));
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  try {
    const r = await applyStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: r.duplicate, outcome: r.outcome });
  } catch (err) {
    console.error("[stripe-webhook] processing failed", event.id, event.type, (err as Error).message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
