import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma, type CardPayment, type CardPaymentStatus } from "@trestle/db";
import {
  CARD_PAYMENT_RANK,
  SHIPPING_METHODS,
  allocateProportionally,
  computeCardTotals,
  microsToCents,
  type ShippingMethodId,
} from "@trestle/shared";
import { env } from "./env";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./http";
import { clearCartLines, hydrateCart, readCart } from "./cart";
import { cardConfig, stripe, type Stripe } from "./stripe";
import type { AuthedUser } from "./session";

// ---------------------------------------------------------------------------------------------
// guest access tokens: opaque 256-bit random values; only SHA-256 hashes are stored
// ---------------------------------------------------------------------------------------------

export const GUEST_ORDER_COOKIE_PREFIX = "trestle_go_";
const GUEST_COOKIE_MAX_AGE = 180 * 24 * 3600;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

function tokenMatches(token: string | undefined | null, hash: string | null): boolean {
  if (!token || !hash || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setGuestOrderCookie(res: NextResponse, paymentId: string, token: string) {
  res.cookies.set(`${GUEST_ORDER_COOKIE_PREFIX}${paymentId}`, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
}

/** Who may see a card payment and its orders. */
export type CardViewer = "owner" | "guest" | "admin" | "seller";

export async function authorizeCardPayment(
  paymentId: string,
  user: AuthedUser | null,
  req: NextRequest | { cookies: { get(name: string): { value: string } | undefined } },
  explicitToken?: string | null,
): Promise<{ payment: CardPayment; viewer: CardViewer }> {
  const payment = await prisma.cardPayment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound("Order");
  if (user && payment.userId === user.id) return { payment, viewer: "owner" };
  const token = explicitToken ?? req.cookies.get(`${GUEST_ORDER_COOKIE_PREFIX}${paymentId}`)?.value;
  if (tokenMatches(token, payment.guestAccessTokenHash)) return { payment, viewer: "guest" };
  if (user?.role === "ADMIN") return { payment, viewer: "admin" };
  if (user?.sellerId) {
    const mine = await prisma.order.count({
      where: { cardPaymentId: paymentId, sellerId: user.sellerId },
    });
    if (mine > 0) return { payment, viewer: "seller" };
  }
  // same response as a missing payment, so ids cannot be probed
  throw notFound("Order");
}

// ---------------------------------------------------------------------------------------------
// promo codes
// ---------------------------------------------------------------------------------------------

export async function findPromo(code: string | undefined) {
  if (!code) return null;
  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
  const now = new Date();
  if (
    !promo ||
    !promo.active ||
    (promo.startsAt && promo.startsAt > now) ||
    (promo.endsAt && promo.endsAt < now) ||
    (promo.maxRedemptions != null && promo.redemptions >= promo.maxRedemptions)
  )
    throw badRequest("That promo code is not valid.");
  return promo;
}

// ---------------------------------------------------------------------------------------------
// totals (server-side, exact cents)
// ---------------------------------------------------------------------------------------------

export async function cardQuote(
  cartOwnerKey: string,
  input: { shippingMethod: ShippingMethodId; promoCode?: string },
) {
  const cart = await hydrateCart(await readCart(cartOwnerKey));
  if (cart.lines.length === 0) throw badRequest("Your bag is empty.");
  const promo = await findPromo(input.promoCode);
  const totals = computeCardTotals({
    lines: cart.lines.map((l) => ({
      unitPriceMicros: l.product.priceUsdMicros,
      quantity: l.quantity,
    })),
    shippingMethod: input.shippingMethod,
    promo: promo && {
      code: promo.code,
      percentOff: promo.percentOff,
      amountOffCents: promo.amountOffCents,
      minSubtotalCents: promo.minSubtotalCents,
    },
  });
  const promoApplied = !!promo && totals.discountCents > 0;
  return {
    cart,
    promo: promoApplied ? promo : null,
    promoNote:
      promo && !promoApplied
        ? `${promo.code} applies to orders of $${(promo.minSubtotalCents / 100).toFixed(2)} or more.`
        : null,
    totals,
  };
}

// ---------------------------------------------------------------------------------------------
// session creation
// ---------------------------------------------------------------------------------------------

interface StoredLines {
  cartOwner: string;
  items: { variantId: string; quantity: number; unitCents: number; title: string; variant: string }[];
}

export async function createCardCheckout(args: {
  user: AuthedUser | null;
  cartOwnerKey: string;
  shippingMethod: ShippingMethodId;
  promoCode?: string;
  email?: string;
  origin: string;
}) {
  const cfg = cardConfig();
  if (!cfg.enabled) throw new ApiError(503, "card_unavailable", cfg.reason ?? "Card payments are unavailable.");
  await sweepExpiredCardPayments().catch((err) =>
    console.warn("[card] sweep failed", (err as Error).message),
  );

  // A bag has at most one open checkout: starting a new one (retry) expires the previous session first,
  // so stock is never held twice for the same bag.
  const previous = await prisma.cardPayment.findMany({
    where: { status: "OPEN", lines: { path: ["cartOwner"], equals: args.cartOwnerKey } },
  });
  for (const p of previous) await expireAndRelease(p.id, "replaced by a new checkout");

  const quote = await cardQuote(args.cartOwnerKey, args);
  if (quote.cart.warnings.length)
    throw conflict(quote.cart.warnings.join(" "), { code: "bag_changed" });

  const e = env();
  const ttlMs = e.CARD_CHECKOUT_TTL_MINUTES * 60_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const guestToken = randomBytes(32).toString("base64url");
  const paymentId = `cp_${randomBytes(12).toString("hex")}`;
  const email = args.user?.email ?? args.email ?? null;

  const lines: StoredLines = {
    cartOwner: args.cartOwnerKey,
    items: quote.cart.lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      unitCents: microsToCents(l.product.priceUsdMicros),
      title: l.product.title,
      variant: l.variantName,
    })),
  };

  // 1) atomically reserve stock + create payment and per-seller orders
  await prisma.$transaction(async (tx) => {
    for (const l of quote.cart.lines) {
      const res = await tx.productVariant.updateMany({
        where: { id: l.variantId, stock: { gte: l.quantity }, product: { status: "ACTIVE" } },
        data: { stock: { decrement: l.quantity } },
      });
      if (res.count !== 1)
        throw conflict(`“${l.product.title}” in ${l.variantName} just sold out.`, {
          variantId: l.variantId,
          code: "sold_out",
        });
    }
    await tx.cardPayment.create({
      data: {
        id: paymentId,
        userId: args.user?.id ?? null,
        status: "OPEN",
        currency: "usd",
        subtotalCents: quote.totals.subtotalCents,
        discountCents: quote.totals.discountCents,
        shippingCents: quote.totals.shippingCents,
        totalCents: quote.totals.totalCents,
        promoCode: quote.promo?.code ?? null,
        shippingMethod: args.shippingMethod,
        email,
        guestAccessTokenHash: hashToken(guestToken),
        expiresAt,
        lines: lines as unknown as Prisma.InputJsonValue,
      },
    });
    for (const g of quote.cart.groups) {
      await tx.order.create({
        data: {
          id: `ord_${randomBytes(10).toString("hex")}`,
          buyerId: args.user?.id ?? null,
          sellerId: g.seller.id,
          paymentMethod: "CARD",
          cardPaymentId: paymentId,
          status: "PENDING_PAYMENT",
          subtotalUsdMicros: g.subtotalUsdMicros,
          reservationExpiresAt: expiresAt,
          items: {
            create: g.lines.map((l) => ({
              productId: l.product.id,
              productVariantId: l.variantId,
              titleSnapshot: l.product.title,
              variantSnapshot: l.variantName,
              imageSnapshot: l.image,
              quantity: l.quantity,
              unitPriceUsdMicros: l.product.priceUsdMicros,
            })),
          },
        },
      });
    }
  });

  // 2) hosted Stripe Checkout Session (never touches card data)
  const s = stripe();
  let session: Stripe.Checkout.Session;
  try {
    let couponId: string | undefined;
    if (quote.totals.discountCents > 0) {
      const coupon = await s.coupons.create(
        {
          amount_off: quote.totals.discountCents,
          currency: "usd",
          duration: "once",
          max_redemptions: 1,
          name: quote.promo?.code ?? "Discount",
          metadata: { cardPaymentId: paymentId },
        },
        { idempotencyKey: `trestle:${paymentId}:coupon` },
      );
      couponId = coupon.id;
    }
    const method = SHIPPING_METHODS[args.shippingMethod];
    const imageBase = e.APP_URL?.startsWith("https://") ? e.APP_URL.replace(/\/$/, "") : null;
    session = await s.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: paymentId,
        customer_email: email ?? undefined,
        metadata: { cardPaymentId: paymentId },
        payment_intent_data: { metadata: { cardPaymentId: paymentId } },
        line_items: quote.cart.lines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: "usd",
            unit_amount: microsToCents(l.product.priceUsdMicros),
            product_data: {
              name: l.product.title,
              description: l.variantName,
              ...(imageBase && l.image ? { images: [`${imageBase}${l.image}`] } : {}),
              metadata: { variantId: l.variantId },
            },
          },
        })),
        ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
        shipping_address_collection: {
          allowed_countries: e.SHIPPING_COUNTRIES.split(",")
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
        },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              display_name: method.label,
              fixed_amount: { amount: quote.totals.shippingCents, currency: "usd" },
              delivery_estimate: {
                minimum: { unit: "business_day", value: method.minDays },
                maximum: { unit: "business_day", value: method.maxDays },
              },
            },
          },
        ],
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${args.origin}/checkout/complete?payment=${paymentId}`,
        cancel_url: `${args.origin}/checkout/cancelled?payment=${paymentId}`,
      },
      { idempotencyKey: `trestle:${paymentId}:session` },
    );
    await prisma.cardPayment.update({
      where: { id: paymentId },
      data: { stripeCheckoutSessionId: session.id, stripeCouponId: couponId ?? null },
    });
  } catch (err) {
    // could not open a hosted session: give the stock back immediately
    await releaseReservation(paymentId, "EXPIRED", `Could not start card checkout: ${(err as Error).message}`);
    console.error("[card] session create failed", (err as Error).message);
    throw new ApiError(502, "stripe_unavailable", "We couldn’t start card checkout. Please try again.");
  }
  if (!session.url) throw new ApiError(502, "stripe_unavailable", "Card checkout returned no URL.");

  await prisma.auditLog.create({
    data: {
      actorId: args.user?.id ?? null,
      action: "card.checkout_created",
      entity: "CardPayment",
      entityId: paymentId,
      data: { totalCents: quote.totals.totalCents, sessionId: session.id },
    },
  });
  return { paymentId, url: session.url, guestToken, totals: quote.totals };
}

// ---------------------------------------------------------------------------------------------
// reservation release / expiry
// ---------------------------------------------------------------------------------------------

/** Returns reserved stock and closes the payment + its orders. Idempotent (guarded by stockReleased). */
async function releaseReservation(
  paymentId: string,
  status: Extract<CardPaymentStatus, "EXPIRED" | "FAILED">,
  reason: string,
) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.cardPayment.updateMany({
      where: { id: paymentId, stockReleased: false, status: { in: ["OPEN", "PROCESSING"] } },
      data: { stockReleased: true, status, failureReason: reason },
    });
    if (res.count !== 1) return;
    const orders = await tx.order.findMany({
      where: { cardPaymentId: paymentId },
      include: { items: true },
    });
    for (const o of orders) {
      for (const it of o.items)
        await tx.productVariant.update({
          where: { id: it.productVariantId },
          data: { stock: { increment: it.quantity } },
        });
      await tx.order.update({
        where: { id: o.id },
        data: { status: "CANCELLED", stockReleased: true },
      });
    }
  });
}

/**
 * Expires the Stripe session first (so it can no longer be paid), then releases stock.
 * If Stripe reports the session already completed, nothing is released — the webhook will mark it paid.
 */
export async function expireAndRelease(paymentId: string, reason: string) {
  const p = await prisma.cardPayment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== "OPEN" || p.stockReleased) return { released: false, status: p?.status };
  if (p.stripeCheckoutSessionId && cardConfig().enabled) {
    try {
      await stripe().checkout.sessions.expire(p.stripeCheckoutSessionId);
    } catch (err) {
      const current = await stripe()
        .checkout.sessions.retrieve(p.stripeCheckoutSessionId)
        .catch(() => null);
      if (!current) return { released: false, status: p.status }; // Stripe unreachable: retry later
      if (current.status === "complete") return { released: false, status: p.status };
      if (current.status !== "expired") {
        console.warn("[card] expire failed", (err as Error).message);
        return { released: false, status: p.status };
      }
    }
  }
  await releaseReservation(paymentId, "EXPIRED", reason);
  return { released: true, status: "EXPIRED" as const };
}

/** Sweeps OPEN payments past their expiry (lazy on checkout, plus /api/cron/card-reservations). */
export async function sweepExpiredCardPayments(limit = 25) {
  const stale = await prisma.cardPayment.findMany({
    where: { status: "OPEN", stockReleased: false, expiresAt: { lt: new Date(Date.now() - 60_000) } },
    select: { id: true },
    take: limit,
  });
  let released = 0;
  for (const p of stale) {
    const r = await expireAndRelease(p.id, "checkout session expired");
    if (r.released) released++;
  }
  return { checked: stale.length, released };
}

// ---------------------------------------------------------------------------------------------
// webhook processing — the ONLY path that marks a card payment paid
// ---------------------------------------------------------------------------------------------

type Outcome = { outcome: string };

function sessionPaymentId(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.cardPaymentId ?? session.client_reference_id ?? null;
}

async function lockedPayment(tx: Prisma.TransactionClient, id: string) {
  // row lock serialises concurrent deliveries for the same payment
  await tx.$queryRaw`SELECT id FROM "CardPayment" WHERE id = ${id} FOR UPDATE`;
  return tx.cardPayment.findUnique({ where: { id }, include: { orders: { include: { items: true } } } });
}

function canMove(from: CardPaymentStatus, to: CardPaymentStatus) {
  return CARD_PAYMENT_RANK[to] > CARD_PAYMENT_RANK[from];
}

function shippingFrom(session: Stripe.Checkout.Session): Prisma.InputJsonValue | undefined {
  const sd = session.collected_information?.shipping_details;
  if (!sd) return undefined;
  return {
    name: sd.name,
    line1: sd.address.line1,
    line2: sd.address.line2,
    city: sd.address.city,
    state: sd.address.state,
    postalCode: sd.address.postal_code,
    country: sd.address.country,
  } as Prisma.InputJsonValue;
}

async function onSessionCompleted(session: Stripe.Checkout.Session, eventAt: Date): Promise<Outcome> {
  const id = sessionPaymentId(session);
  if (!id) return { outcome: "ignored:no payment reference" };
  const after: (() => Promise<void>)[] = [];
  const outcome = await prisma.$transaction(async (tx) => {
    const p = await lockedPayment(tx, id);
    if (!p) return "ignored:unknown payment";
    if (p.stripeCheckoutSessionId && p.stripeCheckoutSessionId !== session.id)
      return "ignored:session mismatch";
    // details are recorded whatever the ordering
    const details: Prisma.CardPaymentUpdateInput = {
      email: p.email ?? session.customer_details?.email ?? null,
      shippingAddress: p.shippingAddress ?? shippingFrom(session),
      stripePaymentIntentId:
        p.stripePaymentIntentId ??
        (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) ??
        null,
    };
    if (session.amount_total !== p.totalCents || session.currency?.toLowerCase() !== p.currency) {
      await tx.cardPayment.update({
        where: { id },
        data: {
          ...details,
          failureReason: `Amount mismatch: Stripe ${session.amount_total} ${session.currency}, expected ${p.totalCents} ${p.currency}. Needs review.`,
        },
      });
      return "error:amount mismatch";
    }
    if (session.payment_status === "paid") {
      return markPaid(tx, p, details, eventAt, after);
    }
    if (session.payment_status === "unpaid") {
      // delayed payment method: keep the reservation until async_payment_* arrives
      if (!canMove(p.status, "PROCESSING")) {
        await tx.cardPayment.update({ where: { id }, data: details });
        return "ignored:already past processing";
      }
      await tx.cardPayment.update({
        where: { id },
        data: {
          ...details,
          status: "PROCESSING",
          lastEventAt: eventAt,
          expiresAt: new Date(Date.now() + 14 * 86_400_000),
        },
      });
      return "applied:processing";
    }
    return `ignored:payment_status ${session.payment_status}`;
  });
  for (const fn of after) await fn();
  return { outcome };
}

async function markPaid(
  tx: Prisma.TransactionClient,
  p: NonNullable<Awaited<ReturnType<typeof lockedPayment>>>,
  details: Prisma.CardPaymentUpdateInput,
  eventAt: Date,
  after: (() => Promise<void>)[],
): Promise<string> {
  if (!canMove(p.status, "PAID")) {
    await tx.cardPayment.update({ where: { id: p.id }, data: details });
    return `ignored:already ${p.status}`;
  }
  if (p.stockReleased) {
    // reservation had been released (expired) before the payment landed: try to re-reserve
    let ok = true;
    for (const o of p.orders)
      for (const it of o.items) {
        const r = await tx.productVariant.updateMany({
          where: { id: it.productVariantId, stock: { gte: it.quantity } },
          data: { stock: { decrement: it.quantity } },
        });
        if (r.count !== 1) ok = false;
      }
    if (!ok) {
      // oversold: undo partial re-reservation by throwing, then refund outside the transaction
      throw new OversoldError(p.id);
    }
  }
  await tx.cardPayment.update({
    where: { id: p.id },
    data: { ...details, status: "PAID", paidAt: new Date(), stockReleased: false, lastEventAt: eventAt, failureReason: null },
  });
  await tx.order.updateMany({
    where: { cardPaymentId: p.id },
    data: { status: "PROCESSING", stockReleased: false, reservationExpiresAt: null },
  });
  if (p.promoCode)
    await tx.promoCode.updateMany({ where: { code: p.promoCode }, data: { redemptions: { increment: 1 } } });
  const lines = p.lines as unknown as StoredLines;
  if (lines?.cartOwner) {
    after.push(() =>
      clearCartLines(
        lines.cartOwner,
        lines.items.map((i) => i.variantId),
      ).catch(() => undefined),
    );
  }
  return "applied:paid";
}

class OversoldError extends Error {
  constructor(public paymentId: string) {
    super("oversold");
  }
}

/** Paid after the stock was sold to someone else: refund in full and cancel. */
async function refundOversold(paymentId: string, session: Stripe.Checkout.Session): Promise<Outcome> {
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (pi) {
    await stripe().refunds.create(
      { payment_intent: pi, reason: "requested_by_customer", metadata: { cardPaymentId: paymentId } },
      { idempotencyKey: `trestle:${paymentId}:oversold-refund` },
    );
  }
  await prisma.$transaction([
    prisma.cardPayment.update({
      where: { id: paymentId },
      data: {
        status: "REFUNDED",
        refundedCents: session.amount_total ?? 0,
        stripePaymentIntentId: pi ?? null,
        failureReason: "Sold out before your payment completed — refunded in full.",
      },
    }),
    prisma.order.updateMany({ where: { cardPaymentId: paymentId }, data: { status: "CANCELLED" } }),
  ]);
  return { outcome: "applied:oversold-refunded" };
}

async function onAsyncSucceeded(session: Stripe.Checkout.Session, eventAt: Date): Promise<Outcome> {
  const id = sessionPaymentId(session);
  if (!id) return { outcome: "ignored:no payment reference" };
  const after: (() => Promise<void>)[] = [];
  const outcome = await prisma.$transaction(async (tx) => {
    const p = await lockedPayment(tx, id);
    if (!p) return "ignored:unknown payment";
    if (session.amount_total !== p.totalCents) return "error:amount mismatch";
    return markPaid(
      tx,
      p,
      {
        shippingAddress: p.shippingAddress ?? shippingFrom(session),
        email: p.email ?? session.customer_details?.email ?? null,
      },
      eventAt,
      after,
    );
  });
  for (const fn of after) await fn();
  return { outcome };
}

async function onFailedOrExpired(
  session: Stripe.Checkout.Session,
  status: "FAILED" | "EXPIRED",
): Promise<Outcome> {
  const id = sessionPaymentId(session);
  if (!id) return { outcome: "ignored:no payment reference" };
  const p = await prisma.cardPayment.findUnique({ where: { id } });
  if (!p) return { outcome: "ignored:unknown payment" };
  if (!canMove(p.status, status)) return { outcome: `ignored:already ${p.status}` };
  await releaseReservation(
    id,
    status,
    status === "FAILED" ? "The payment was declined or failed." : "Checkout session expired.",
  );
  return { outcome: `applied:${status.toLowerCase()}` };
}

async function onChargeRefunded(charge: Stripe.Charge): Promise<Outcome> {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return { outcome: "ignored:no payment intent" };
  return {
    outcome: await prisma.$transaction(async (tx) => {
      const found = await tx.cardPayment.findUnique({ where: { stripePaymentIntentId: pi } });
      if (!found) return "ignored:unknown payment intent";
      const p = await lockedPayment(tx, found.id);
      if (!p) return "ignored:unknown payment";
      const refunded = Math.max(p.refundedCents, charge.amount_refunded);
      const status: CardPaymentStatus =
        refunded >= p.totalCents ? "REFUNDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : p.status;
      await tx.cardPayment.update({
        where: { id: p.id },
        data: {
          refundedCents: refunded,
          status: canMove(p.status, status) || status === p.status ? status : p.status,
        },
      });
      if (status === "REFUNDED")
        await tx.order.updateMany({
          where: { cardPaymentId: p.id, status: { notIn: ["CANCELLED"] } },
          data: { status: "REFUNDED" },
        });
      return `applied:refunded ${refunded}`;
    }),
  };
}

/** Applies one verified Stripe event exactly once (StripeEvent ledger). */
export async function applyStripeEvent(event: Stripe.Event): Promise<{ duplicate: boolean; outcome: string }> {
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing?.processedAt) return { duplicate: true, outcome: existing.outcome ?? "processed" };
  if (!existing) {
    try {
      await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      // a concurrent delivery of the same event is in flight; handlers are idempotent regardless
    }
  }
  const eventAt = new Date(event.created * 1000);
  let result: Outcome;
  try {
    switch (event.type) {
      case "checkout.session.completed":
        result = await onSessionCompleted(event.data.object, eventAt);
        break;
      case "checkout.session.async_payment_succeeded":
        result = await onAsyncSucceeded(event.data.object, eventAt);
        break;
      case "checkout.session.async_payment_failed":
        result = await onFailedOrExpired(event.data.object, "FAILED");
        break;
      case "checkout.session.expired":
        result = await onFailedOrExpired(event.data.object, "EXPIRED");
        break;
      case "charge.refunded":
        result = await onChargeRefunded(event.data.object);
        break;
      default:
        result = { outcome: `ignored:unhandled ${event.type}` };
    }
  } catch (err) {
    if (err instanceof OversoldError && "object" in event.data) {
      result = await refundOversold(err.paymentId, event.data.object as Stripe.Checkout.Session);
    } else {
      // leave processedAt null so Stripe's retry re-applies it
      await prisma.stripeEvent.update({
        where: { id: event.id },
        data: { outcome: `error:${(err as Error).message.slice(0, 200)}` },
      });
      throw err;
    }
  }
  await prisma.stripeEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), outcome: result.outcome },
  });
  return { duplicate: false, outcome: result.outcome };
}

// ---------------------------------------------------------------------------------------------
// reads, cancel, claim, refunds
// ---------------------------------------------------------------------------------------------

export async function cardPaymentView(paymentId: string, viewer: CardViewer, sellerId?: string | null) {
  const p = await prisma.cardPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      orders: {
        where: viewer === "seller" && sellerId ? { sellerId } : undefined,
        orderBy: { createdAt: "asc" },
        include: {
          items: { include: { product: { select: { slug: true } } } },
          seller: { select: { storefrontName: true, slug: true } },
          returnRequests: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  const { guestAccessTokenHash: _h, lines: _l, stripeCouponId: _c, ...safe } = p;
  return { payment: safe, viewer };
}

/** Buyer-initiated cancel from the Stripe cancel page (never marks anything paid). */
export async function cancelCardCheckout(paymentId: string) {
  const r = await expireAndRelease(paymentId, "cancelled by buyer");
  return r;
}

/** A signed-in user who holds the guest token may attach the order to their account. */
export async function claimCardPayment(payment: CardPayment, user: AuthedUser) {
  if (payment.userId && payment.userId !== user.id) throw forbidden("This order belongs to another account.");
  await prisma.$transaction([
    prisma.cardPayment.update({ where: { id: payment.id }, data: { userId: user.id } }),
    prisma.order.updateMany({
      where: { cardPaymentId: payment.id, buyerId: null },
      data: { buyerId: user.id },
    }),
  ]);
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "card.order_claimed", entity: "CardPayment", entityId: payment.id },
  });
}

/** Issues a Stripe refund. The charge.refunded webhook updates totals; refundedCents is also bumped here. */
export async function refundCardPayment(
  paymentId: string,
  amountCents: number,
  reason: string,
  idempotencyKey: string,
) {
  const p = await prisma.cardPayment.findUnique({ where: { id: paymentId } });
  if (!p) throw notFound("Payment");
  if (!["PAID", "PARTIALLY_REFUNDED"].includes(p.status) || !p.stripePaymentIntentId)
    throw conflict("Only paid card payments can be refunded.");
  const remaining = p.totalCents - p.refundedCents;
  if (amountCents > remaining)
    throw badRequest(`At most $${(remaining / 100).toFixed(2)} can still be refunded.`);
  const refund = await stripe().refunds.create(
    {
      payment_intent: p.stripePaymentIntentId,
      amount: amountCents,
      metadata: { cardPaymentId: p.id, reason: reason.slice(0, 200) },
    },
    { idempotencyKey },
  );
  const refunded = p.refundedCents + amountCents;
  await prisma.cardPayment.update({
    where: { id: p.id },
    data: {
      refundedCents: refunded,
      status: refunded >= p.totalCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
    },
  });
  return { refundId: refund.id, refundedCents: refunded };
}

/** Amount attributable to one seller order within a (possibly multi-seller) card payment. */
export async function orderShareCents(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!o.cardPaymentId) throw badRequest("Not a card order");
  const p = await prisma.cardPayment.findUniqueOrThrow({
    where: { id: o.cardPaymentId },
    include: { orders: { orderBy: { id: "asc" } } },
  });
  const weights = p.orders.map((x) => microsToCents(x.subtotalUsdMicros));
  const shares = allocateProportionally(p.totalCents, weights);
  return { payment: p, shareCents: shares[p.orders.findIndex((x) => x.id === orderId)] ?? 0 };
}
