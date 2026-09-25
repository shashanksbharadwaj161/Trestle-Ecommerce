import { NextResponse, type NextRequest } from "next/server";
import { authorizeCardPayment, setGuestOrderCookie } from "@/server/card-checkout";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/http";

/**
 * Private order link: /api/checkout/card/<id>/access?t=<token>. Validates the token, stores it in an
 * httpOnly cookie and redirects to the order page without the token in the URL.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const target = new URL(`/order-status/${encodeURIComponent(id)}`, req.nextUrl.origin);
  const rl = await rateLimit("order-access", clientIp(req), 30, 600);
  if (!rl.ok) return NextResponse.redirect(new URL("/order-status?error=rate", req.nextUrl.origin));
  const token = req.nextUrl.searchParams.get("t");
  try {
    await authorizeCardPayment(id, null, req, token);
  } catch {
    return NextResponse.redirect(new URL("/order-status?error=invalid", req.nextUrl.origin));
  }
  const res = NextResponse.redirect(target);
  res.headers.set("Referrer-Policy", "no-referrer");
  if (token) setGuestOrderCookie(res, id, token);
  return res;
}
