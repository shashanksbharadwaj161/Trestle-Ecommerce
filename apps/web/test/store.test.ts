/**
 * Storefront, accounts and CARD checkout tests.
 *
 * Card checkout runs against test/mock-stripe.ts — a LOCAL MOCK of the Stripe API, not Stripe. Webhooks are
 * signed with the real Stripe SDK helper (generateTestHeaderString) and verified by the real
 * stripe.webhooks.constructEvent, so signature checking is genuine; the payment itself is simulated.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "@trestle/db";
import { MockStripe } from "./mock-stripe";
import { call, fixtureSeller, newJar, ORIGIN, req, resetDb, signIn, type Jar } from "./helpers";
import { __setKV, MemoryKV } from "@/server/kv";

import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { POST as credentialsPOST } from "@/app/api/account/credentials/route";
import { GET as wishlistGET, POST as wishlistPOST } from "@/app/api/account/wishlist/route";
import { GET as cartGET, POST as cartPOST } from "@/app/api/cart/route";
import { POST as quotePOST } from "@/app/api/checkout/card/quote/route";
import { POST as cardPOST } from "@/app/api/checkout/card/route";
import { GET as cardGET } from "@/app/api/checkout/card/[id]/route";
import { POST as cancelPOST } from "@/app/api/checkout/card/[id]/cancel/route";
import { POST as claimPOST } from "@/app/api/checkout/card/[id]/claim/route";
import { GET as accessGET } from "@/app/api/checkout/card/[id]/access/route";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { GET as cronGET } from "@/app/api/cron/card-reservations/route";
import { POST as fulfilPOST } from "@/app/api/orders/[id]/fulfillment/route";
import { POST as returnsPOST } from "@/app/api/returns/route";
import { POST as adminReturnPOST } from "@/app/api/admin/returns/[id]/route";
import { GET as adminOrdersGET } from "@/app/api/admin/orders/route";
import { POST as adminOrderPOST } from "@/app/api/admin/orders/[id]/route";
import { GET as adminMessagesGET } from "@/app/api/admin/messages/route";
import { POST as contactPOST } from "@/app/api/contact/route";
import { PATCH as productPATCH } from "@/app/api/products/[id]/route";
import { POST as quoteCryptoPOST } from "@/app/api/checkout/quote/route";
import { GET as productsGET } from "@/app/api/products/route";

const stripe = new MockStripe();
const sdk = new Stripe("sk_test_mock_0000000000000000000000000000");
const WHSEC = "whsec_test_mock_0000000000000000000000000";

const post = (path: string, body: unknown, jar?: Jar) =>
  req(path, { method: "POST", body, jar, headers: { origin: ORIGIN } });

async function deliver(event: unknown, opts: { badSignature?: boolean } = {}) {
  const payload = JSON.stringify(event);
  const header = sdk.webhooks.generateTestHeaderString({ payload, secret: opts.badSignature ? "whsec_wrong" : WHSEC });
  return call(stripeWebhook, req("/api/webhooks/stripe", { method: "POST", rawBody: payload, headers: { "stripe-signature": header, "content-type": "application/json" } }));
}

async function register(jar = newJar(), email = `u${Math.random().toString(36).slice(2, 8)}@example.test`) {
  const r = await call(registerPOST, post("/api/auth/register", { email, password: "correct horse battery", name: "Test Buyer" }, jar), undefined, jar);
  return { jar, email, res: r };
}

async function addToBag(jar: Jar, variantId: string, quantity = 1) {
  const r = await call(cartPOST, post("/api/cart", { op: "add", variantId, quantity }, jar), undefined, jar);
  expect(r.status).toBe(200);
  return r;
}

async function startCheckout(jar: Jar, body: Record<string, unknown> = {}) {
  return call(cardPOST, post("/api/checkout/card", { shippingMethod: "standard", email: "guest@example.test", ...body }, jar), undefined, jar);
}

const variantStock = async (id: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;

beforeAll(async () => {
  await stripe.start(12111);
});
afterAll(async () => {
  await stripe.stop();
  await prisma.$disconnect();
});
beforeEach(async () => {
  __setKV(new MemoryKV());
  await resetDb();
  stripe.refunds = [];
  stripe.requests = [];
  stripe.sessions.clear();
});

// ------------------------------------------------------------------------------------------------
describe("email accounts & identity linking", () => {
  it("registers, rejects duplicates, and signs in with generic errors", async () => {
    const { jar, email, res } = await register();
    expect(res.status).toBe(201);
    expect(res.data.user.email).toBe(email);
    const s = await call(sessionGET, req("/api/auth/session", { jar }));
    expect(s.data.user.email).toBe(email);

    const dup = await register(newJar(), email.toUpperCase());
    expect(dup.res.status).toBe(409);

    const bad = await call(loginPOST, post("/api/auth/login", { email, password: "wrong password!!" }));
    expect(bad.status).toBe(401);
    const unknown = await call(loginPOST, post("/api/auth/login", { email: "nobody@example.test", password: "whatever12345" }));
    expect(unknown.status).toBe(401);
    expect(unknown.data.error.message).toBe(bad.data.error.message); // no account enumeration

    const ok = await call(loginPOST, post("/api/auth/login", { email, password: "correct horse battery" }));
    expect(ok.status).toBe(200);

    const weak = await call(registerPOST, post("/api/auth/register", { email: "weak@example.test", password: "short", name: "W" }));
    expect(weak.status).toBe(400);
  });

  it("email-only accounts cannot use crypto checkout until a wallet is proven", async () => {
    const { jar } = await register();
    const q = await call(quoteCryptoPOST, post("/api/checkout/quote", { sellerId: "x" }, jar));
    expect(q.status).toBe(403);
    expect(q.data.error.code).toBe("wallet_required");
  });

  it("links a wallet only with both a session and a wallet signature, never onto another account", async () => {
    const { privateKeyToAccount, generatePrivateKey } = await import("viem/accounts");
    const { createSiweMessage } = await import("viem/siwe");
    const { GET: nonceGET } = await import("@/app/api/auth/nonce/route");
    const { POST: verifyPOST } = await import("@/app/api/auth/verify/route");
    async function prove(jar: Jar, pk: `0x${string}`) {
      const account = privateKeyToAccount(pk);
      const n = await call(nonceGET, req("/api/auth/nonce", { jar }), undefined, jar);
      const message = createSiweMessage({ address: account.address, chainId: 31338, domain: "localhost:3000", nonce: n.data.nonce, uri: ORIGIN, version: "1", issuedAt: new Date() });
      return call(verifyPOST, post("/api/auth/verify", { message, signature: await account.signMessage({ message }) }, jar), undefined, jar);
    }
    // wallet A belongs to its own account
    const walletA = await signIn();
    // an email user proves a fresh wallet B while signed in → linked onto the same account
    const { jar } = await register();
    const before = await call(sessionGET, req("/api/auth/session", { jar }));
    const linked = await prove(jar, generatePrivateKey());
    expect(linked.status).toBe(200);
    expect(linked.data.linked).toBe(true);
    expect(linked.data.user.id).toBe(before.data.user.id);
    // another email user proving wallet A is refused — the wallet never moves between accounts
    const other = await register();
    const stolen = await prove(other.jar, walletA.pk);
    expect(stolen.status).toBe(409);
    expect(stolen.data.error.code).toBe("wallet_in_use");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: walletA.user.id } })).walletAddress).toBe(walletA.user.walletAddress);
    // an account already linked to wallet B cannot switch to a third wallet by signing it
    const switched = await prove(jar, generatePrivateKey());
    expect(switched.status).toBe(409);
    expect(switched.data.error.code).toBe("wallet_mismatch");
  });

  it("lets a wallet account add email sign-in, and requires the current password to change it", async () => {
    const { jar } = await signIn();
    const add = await call(credentialsPOST, post("/api/account/credentials", { email: "wallet@example.test", password: "first password 1" }, jar));
    expect(add.status).toBe(200);
    expect(add.data.user.hasPassword).toBe(true);
    const noCurrent = await call(credentialsPOST, post("/api/account/credentials", { email: "wallet@example.test", password: "second password 2" }, jar));
    expect(noCurrent.status).toBe(401);
    const change = await call(credentialsPOST, post("/api/account/credentials", { email: "wallet@example.test", password: "second password 2", currentPassword: "first password 1" }, jar));
    expect(change.status).toBe(200);
  });
});

// ------------------------------------------------------------------------------------------------
describe("guest bag, wishlist and catalogue", () => {
  it("keeps a guest bag across requests and merges it into the account on sign-in", async () => {
    const { product } = await fixtureSeller({ stock: 5 });
    const v = product.variants[0]!.id;
    const jar = newJar();
    const first = await call(cartGET, req("/api/cart", { jar }), undefined, jar);
    expect(first.data.lines).toHaveLength(0);
    expect(jar.cookies.get("trestle_cart")).toBeTruthy();
    await addToBag(jar, v, 2);
    const reload = await call(cartGET, req("/api/cart", { jar }), undefined, jar);
    expect(reload.data.lines[0].quantity).toBe(2);

    // another visitor has their own bag
    const other = await call(cartGET, req("/api/cart", { jar: newJar() }));
    expect(other.data.lines).toHaveLength(0);

    await register(jar);
    const merged = await call(cartGET, req("/api/cart", { jar }), undefined, jar);
    expect(merged.data.lines[0].quantity).toBe(2);
    expect(merged.data.lines[0].colour).toBe("Black");
  });

  it("persists the wishlist for signed-in users and merges guest ids", async () => {
    const { product } = await fixtureSeller();
    const { jar } = await register();
    const merged = await call(wishlistPOST, post("/api/account/wishlist", { op: "merge", productIds: [product.id, "does-not-exist"] }, jar));
    expect(merged.data.productIds).toEqual([product.id]);
    const again = await call(wishlistGET, req("/api/account/wishlist", { jar }));
    expect(again.data.items[0].title).toBe("Fixture Tee");
    const removed = await call(wishlistPOST, post("/api/account/wishlist", { op: "remove", productId: product.id }, jar));
    expect(removed.data.productIds).toEqual([]);
    const anon = await call(wishlistGET, req("/api/account/wishlist"));
    expect(anon.status).toBe(401);
  });

  it("filters by colour and only-in-stock size, with facets", async () => {
    await fixtureSeller({ stock: 0 });
    const blackM = await call(productsGET, req("/api/products?colour=Black&size=M"));
    expect(blackM.data.total).toBe(0); // black M is sold out → size filter excludes it
    const sky = await call(productsGET, req("/api/products?colour=Sky&size=M"));
    expect(sky.data.total).toBe(1);
    expect(sky.data.facets.colours.map((c: { value: string }) => c.value).sort()).toEqual(["Black", "Sky"]);
    expect(sky.data.items[0].colours.find((c: { name: string }) => c.name === "Black").inStock).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------
describe("card checkout (mock Stripe contract)", () => {
  async function paidOrder(opts: { stock?: number; promo?: string } = {}) {
    const f = await fixtureSeller({ stock: opts.stock ?? 3 });
    const jar = newJar();
    await addToBag(jar, f.product.variants[0]!.id, 1);
    const start = await startCheckout(jar, opts.promo ? { promoCode: opts.promo } : {});
    expect(start.status).toBe(200);
    const payment = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId } });
    const session = stripe.pay(payment.stripeCheckoutSessionId!);
    const ev = stripe.sessionEvent("checkout.session.completed", session);
    const hook = await deliver(ev);
    expect(hook.status).toBe(200);
    return { ...f, jar, paymentId: start.data.paymentId as string, session, event: ev };
  }

  it("quotes exact cents server-side, with free delivery and promo thresholds", async () => {
    const f = await fixtureSeller();
    const jar = newJar();
    await addToBag(jar, f.product.variants[0]!.id, 1); // $125.00
    const std = await call(quotePOST, post("/api/checkout/card/quote", { shippingMethod: "standard" }, jar));
    expect(std.data.totals).toEqual({ subtotalCents: 12500, discountCents: 0, shippingCents: 800, totalCents: 13300 });
    await prisma.promoCode.create({ data: { code: "TEST10", percentOff: 10, minSubtotalCents: 10000 } });
    const promo = await call(quotePOST, post("/api/checkout/card/quote", { shippingMethod: "express", promoCode: "test10" }, jar));
    expect(promo.data.totals).toEqual({ subtotalCents: 12500, discountCents: 1250, shippingCents: 2000, totalCents: 13250 });
    const bad = await call(quotePOST, post("/api/checkout/card/quote", { shippingMethod: "standard", promoCode: "NOPE99" }, jar));
    expect(bad.status).toBe(400);
    await addToBag(jar, f.product.variants[0]!.id, 1); // $250 → free standard delivery
    const free = await call(quotePOST, post("/api/checkout/card/quote", { shippingMethod: "standard" }, jar));
    expect(free.data.totals.shippingCents).toBe(0);
  });

  it("reserves stock, opens a hosted session with matching amounts, and the success page does not mark it paid", async () => {
    const f = await fixtureSeller({ stock: 3 });
    const v = f.product.variants[0]!.id;
    const jar = newJar();
    await addToBag(jar, v, 2);
    await prisma.promoCode.create({ data: { code: "TEST10", percentOff: 10, minSubtotalCents: 0 } });
    const start = await startCheckout(jar, { promoCode: "TEST10" });
    expect(start.status).toBe(200);
    expect(start.data.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(await variantStock(v)).toBe(1);
    const p = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId }, include: { orders: true } });
    expect(p.status).toBe("OPEN");
    expect(p.totalCents).toBe(25000 - 2500 + 0);
    expect(p.orders.every((o) => o.status === "PENDING_PAYMENT" && o.paymentMethod === "CARD" && o.buyerId === null)).toBe(true);
    const session = stripe.sessions.get(p.stripeCheckoutSessionId!)!;
    expect(session.amount_total).toBe(p.totalCents);
    const create = stripe.requests.find((r) => r.path === "/v1/checkout/sessions")!;
    expect(create.idempotencyKey).toBe(`trestle:${p.id}:session`);
    expect(create.params["payment_intent_data[metadata][cardPaymentId]"]).toBe(p.id);
    expect(create.params.success_url).toContain(`/checkout/complete?payment=${p.id}`);
    // no raw card data anywhere in our request
    expect(Object.keys(create.params).some((k) => /card\[|cvc|card_number|\[number\]|exp_month/i.test(k))).toBe(false);

    // the buyer lands on the success URL without paying: status stays OPEN
    const view = await call(cardGET, req(`/api/checkout/card/${p.id}`, { jar }), { id: p.id });
    expect(view.status).toBe(200);
    expect(view.data.payment.status).toBe("OPEN");
    expect(view.data.privateLink).toContain(`/api/checkout/card/${p.id}/access?t=`);
  });

  it("marks paid only from a correctly signed webhook, exactly once", async () => {
    const f = await fixtureSeller({ stock: 3 });
    const v = f.product.variants[0]!.id;
    const jar = newJar();
    await addToBag(jar, v, 1);
    await prisma.promoCode.create({ data: { code: "ONCE", amountOffCents: 500, minSubtotalCents: 0 } });
    const start = await startCheckout(jar, { promoCode: "ONCE" });
    const p = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId } });
    const session = stripe.pay(p.stripeCheckoutSessionId!);
    const ev = stripe.sessionEvent("checkout.session.completed", session);

    const forged = await deliver(ev, { badSignature: true });
    expect(forged.status).toBe(400);
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("OPEN");

    const ok = await deliver(ev);
    expect(ok.data.outcome).toBe("applied:paid");
    const paid = await prisma.cardPayment.findUniqueOrThrow({ where: { id: p.id }, include: { orders: true } });
    expect(paid.status).toBe("PAID");
    expect(paid.orders[0]!.status).toBe("PROCESSING");
    expect((paid.shippingAddress as Record<string, string>).city).toBe("Testville");
    expect(await variantStock(v)).toBe(2); // reserved stock is now sold, not released
    const bag = await call(cartGET, req("/api/cart", { jar }), undefined, jar);
    expect(bag.data.lines).toHaveLength(0); // bag cleared once paid

    const replay = await deliver(ev);
    expect(replay.data.duplicate).toBe(true);
    expect((await prisma.promoCode.findUniqueOrThrow({ where: { code: "ONCE" } })).redemptions).toBe(1);

    // an out-of-order "expired" after payment is ignored
    const late = await deliver(stripe.sessionEvent("checkout.session.expired", session));
    expect(late.data.outcome).toMatch(/^ignored/);
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PAID");
    expect(await variantStock(v)).toBe(2);
  });

  it("refuses to fulfil when the paid amount does not match", async () => {
    const f = await fixtureSeller();
    const jar = newJar();
    await addToBag(jar, f.product.variants[0]!.id, 1);
    const start = await startCheckout(jar);
    const p = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId } });
    const session = stripe.pay(p.stripeCheckoutSessionId!);
    const r = await deliver(stripe.sessionEvent("checkout.session.completed", session, { amount_total: 100 }));
    expect(r.data.outcome).toBe("error:amount mismatch");
    const after = await prisma.cardPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("OPEN");
    expect(after.failureReason).toMatch(/Amount mismatch/);
  });

  it("handles delayed payments: processing, then failed (stock released) or succeeded", async () => {
    const f = await fixtureSeller({ stock: 2 });
    const v = f.product.variants[0]!.id;
    const jarA = newJar();
    await addToBag(jarA, v, 1);
    const a = await startCheckout(jarA);
    const pa = await prisma.cardPayment.findUniqueOrThrow({ where: { id: a.data.paymentId } });
    const sa = stripe.pay(pa.stripeCheckoutSessionId!, { async: true });
    expect((await deliver(stripe.sessionEvent("checkout.session.completed", sa))).data.outcome).toBe("applied:processing");
    expect(await variantStock(v)).toBe(1); // still held while the bank processes
    expect((await deliver(stripe.sessionEvent("checkout.session.async_payment_failed", sa))).data.outcome).toBe("applied:failed");
    expect(await variantStock(v)).toBe(2);
    expect((await prisma.order.findFirstOrThrow({ where: { cardPaymentId: pa.id } })).status).toBe("CANCELLED");

    const jarB = newJar();
    await addToBag(jarB, v, 1);
    const b = await startCheckout(jarB);
    const pb = await prisma.cardPayment.findUniqueOrThrow({ where: { id: b.data.paymentId } });
    const sb = stripe.pay(pb.stripeCheckoutSessionId!, { async: true });
    // succeeded can arrive before completed; both orders of arrival end PAID
    expect((await deliver(stripe.sessionEvent("checkout.session.async_payment_succeeded", { ...sb, payment_status: "paid" }))).data.outcome).toBe("applied:paid");
    expect((await deliver(stripe.sessionEvent("checkout.session.completed", sb))).data.outcome).toMatch(/^ignored/);
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: pb.id } })).status).toBe("PAID");
  });

  it("cancel expires the hosted session first, then releases stock; the bag is kept", async () => {
    const f = await fixtureSeller({ stock: 3 });
    const v = f.product.variants[0]!.id;
    const jar = newJar();
    await addToBag(jar, v, 2);
    const start = await startCheckout(jar);
    expect(await variantStock(v)).toBe(1);
    const other = await call(cancelPOST, post(`/api/checkout/card/${start.data.paymentId}/cancel`, {}, newJar()), { id: start.data.paymentId });
    expect(other.status).toBe(404); // not yours
    const c = await call(cancelPOST, post(`/api/checkout/card/${start.data.paymentId}/cancel`, {}, jar), { id: start.data.paymentId });
    expect(c.status).toBe(200);
    expect(c.data.payment.status).toBe("EXPIRED");
    expect(await variantStock(v)).toBe(3);
    const cancelled = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId } });
    expect(stripe.sessions.get(cancelled.stripeCheckoutSessionId!)!.status).toBe("expired");
    const bag = await call(cartGET, req("/api/cart", { jar }), undefined, jar);
    expect(bag.data.lines[0].quantity).toBe(2);
    // retry opens a fresh session
    const retry = await startCheckout(jar);
    expect(retry.status).toBe(200);
    expect(await variantStock(v)).toBe(1);
  });

  it("a second checkout for the same bag replaces the first instead of double-holding stock", async () => {
    const f = await fixtureSeller({ stock: 3 });
    const v = f.product.variants[0]!.id;
    const jar = newJar();
    await addToBag(jar, v, 2);
    const first = await startCheckout(jar);
    const second = await startCheckout(jar);
    expect(second.status).toBe(200);
    expect(await variantStock(v)).toBe(1);
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: first.data.paymentId } })).status).toBe("EXPIRED");
  });

  it("never oversells the last unit under concurrent checkouts", async () => {
    const f = await fixtureSeller({ stock: 1 });
    const v = f.product.variants[0]!.id;
    const jars = [newJar(), newJar(), newJar(), newJar()];
    for (const j of jars) await addToBag(j, v, 1);
    const results = await Promise.all(jars.map((j) => startCheckout(j)));
    const ok = results.filter((r) => r.status === 200);
    const soldOut = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(soldOut).toHaveLength(3);
    expect(await variantStock(v)).toBe(0);
  });

  it("refunds in full if payment lands after the reservation was released and the item sold", async () => {
    const f = await fixtureSeller({ stock: 1 });
    const v = f.product.variants[0]!.id;
    const jarA = newJar();
    await addToBag(jarA, v, 1);
    const a = await startCheckout(jarA);
    const pa = await prisma.cardPayment.findUniqueOrThrow({ where: { id: a.data.paymentId } });
    // A's checkout is released (e.g. the sweeper) …
    await prisma.cardPayment.update({ where: { id: pa.id }, data: { expiresAt: new Date(Date.now() - 10 * 60_000) } });
    const sweep = await call(cronGET, req("/api/cron/card-reservations", { headers: { authorization: "Bearer test-cron-secret-0123456789abcdef" } }));
    expect(sweep.data.released).toBe(1);
    // … B buys the last unit …
    const jarB = newJar();
    await addToBag(jarB, v, 1);
    expect((await startCheckout(jarB)).status).toBe(200);
    // … and a (simulated) late completion for A arrives
    const sa = stripe.sessions.get(pa.stripeCheckoutSessionId!)!;
    sa.status = "complete";
    sa.payment_status = "paid";
    sa.payment_intent = "pi_late_payment";
    const r = await deliver(stripe.sessionEvent("checkout.session.completed", sa));
    expect(r.data.outcome).toBe("applied:oversold-refunded");
    expect(stripe.refunds.at(-1)).toMatchObject({ payment_intent: "pi_late_payment", idempotencyKey: `trestle:${pa.id}:oversold-refund` });
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: pa.id } })).status).toBe("REFUNDED");
    expect(await variantStock(v)).toBe(0);
  });

  it("records partial and full refunds from charge.refunded", async () => {
    const o = await paidOrder();
    const pi = o.session.payment_intent!;
    await deliver(stripe.chargeRefundedEvent(pi, 1000));
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe("PARTIALLY_REFUNDED");
    const total = (await prisma.cardPayment.findUniqueOrThrow({ where: { id: o.paymentId } })).totalCents;
    await deliver(stripe.chargeRefundedEvent(pi, total));
    const p = await prisma.cardPayment.findUniqueOrThrow({ where: { id: o.paymentId }, include: { orders: true } });
    expect(p.status).toBe("REFUNDED");
    expect(p.refundedCents).toBe(total);
    expect(p.orders[0]!.status).toBe("REFUNDED");
  });

  it("protects guest orders with an opaque token and lets the owner claim them after sign-in", async () => {
    const o = await paidOrder();
    const stranger = await call(cardGET, req(`/api/checkout/card/${o.paymentId}`, { jar: newJar() }), { id: o.paymentId });
    expect(stranger.status).toBe(404);
    const token = o.jar.cookies.get(`trestle_go_${o.paymentId}`)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.cardPayment.findUniqueOrThrow({ where: { id: o.paymentId } });
    expect(stored.guestAccessTokenHash).not.toContain(token); // only the hash is stored

    const bad = await accessGET(req(`/api/checkout/card/${o.paymentId}/access?t=${"x".repeat(43)}`), { params: Promise.resolve({ id: o.paymentId }) });
    expect(bad.headers.get("location")).toContain("/order-status?error=invalid");
    const phoneJar = newJar();
    const good = await accessGET(req(`/api/checkout/card/${o.paymentId}/access?t=${token}`), { params: Promise.resolve({ id: o.paymentId }) });
    expect(good.headers.get("location")).toContain(`/order-status/${o.paymentId}`);
    const { absorb } = await import("./helpers");
    absorb(phoneJar, good);
    const onPhone = await call(cardGET, req(`/api/checkout/card/${o.paymentId}`, { jar: phoneJar }), { id: o.paymentId });
    expect(onPhone.status).toBe(200);

    // a signed-in user holding the token can attach the order; a user without it cannot
    const outsider = await register();
    const denied = await call(claimPOST, post(`/api/checkout/card/${o.paymentId}/claim`, {}, outsider.jar), { id: o.paymentId });
    expect(denied.status).toBe(404);
    await register(o.jar);
    const claim = await call(claimPOST, post(`/api/checkout/card/${o.paymentId}/claim`, {}, o.jar), { id: o.paymentId });
    expect(claim.status).toBe(200);
    const orders = await prisma.order.findMany({ where: { cardPaymentId: o.paymentId } });
    expect(orders.every((x) => x.buyerId)).toBe(true);
  });

  it("rejects the cron endpoint without its secret", async () => {
    const r = await call(cronGET, req("/api/cron/card-reservations"));
    expect(r.status).toBe(401);
  });
});

// ------------------------------------------------------------------------------------------------
describe("fulfilment, returns and admin", () => {
  async function deliveredGuestOrder() {
    const f = await fixtureSeller({ stock: 3 });
    const sellerJar = newJar();
    const { issueSession, SESSION_COOKIE } = await import("@/server/session");
    const s = await issueSession(f.user.id, f.user.walletAddress!);
    sellerJar.cookies.set(SESSION_COOKIE, s.token);
    const jar = newJar();
    await addToBag(jar, f.product.variants[0]!.id, 2);
    const start = await startCheckout(jar);
    const p = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId } });
    const session = stripe.pay(p.stripeCheckoutSessionId!);
    await deliver(stripe.sessionEvent("checkout.session.completed", session));
    const order = await prisma.order.findFirstOrThrow({ where: { cardPaymentId: p.id }, include: { items: true } });
    const early = await call(returnsPOST, post("/api/returns", { orderId: order.id, reason: "Too small", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] }, jar));
    expect(early.status).toBe(409); // not delivered yet
    const ship = await call(fulfilPOST, post(`/api/orders/${order.id}/fulfillment`, { action: "ship", carrier: "UPS", trackingNumber: "1Z999AA10123456784" }, sellerJar), { id: order.id });
    expect(ship.status).toBe(200);
    const deliv = await call(fulfilPOST, post(`/api/orders/${order.id}/fulfillment`, { action: "deliver" }, sellerJar), { id: order.id });
    expect(deliv.status).toBe(200);
    return { f, jar, sellerJar, order, paymentId: p.id, variantId: f.product.variants[0]!.id };
  }

  async function adminJar() {
    const u = await prisma.user.create({ data: { email: `admin${Date.now()}@example.test`, role: "ADMIN" } });
    const { issueSession, SESSION_COOKIE } = await import("@/server/session");
    const s = await issueSession(u.id, "");
    const jar = newJar();
    jar.cookies.set(SESSION_COOKIE, s.token);
    return jar;
  }

  it("runs a return from request to Stripe refund, restocking the goods", async () => {
    const d = await deliveredGuestOrder();
    const item = d.order.items[0]!;
    const rr = await call(returnsPOST, post("/api/returns", { orderId: d.order.id, reason: "Too small", items: [{ orderItemId: item.id, quantity: 1 }] }, d.jar));
    expect(rr.status).toBe(200);
    const again = await call(returnsPOST, post("/api/returns", { orderId: d.order.id, reason: "Too small", items: [{ orderItemId: item.id, quantity: 2 }] }, d.jar));
    expect(again.status).toBe(409); // more than purchased
    const stranger = await call(returnsPOST, post("/api/returns", { orderId: d.order.id, reason: "Too small", items: [{ orderItemId: item.id, quantity: 1 }] }, newJar()));
    expect(stranger.status).toBe(404);

    const admin = await adminJar();
    const id = rr.data.returnRequest.id;
    const refundEarly = await call(adminReturnPOST, post(`/api/admin/returns/${id}`, { action: "receive" }, admin), { id });
    expect(refundEarly.status).toBe(409); // must be approved first
    expect((await call(adminReturnPOST, post(`/api/admin/returns/${id}`, { action: "approve" }, admin), { id })).status).toBe(200);
    const stockBefore = await variantStock(d.variantId);
    expect((await call(adminReturnPOST, post(`/api/admin/returns/${id}`, { action: "receive" }, admin), { id })).status).toBe(200);
    expect(await variantStock(d.variantId)).toBe(stockBefore + 1);
    const refund = await call(adminReturnPOST, post(`/api/admin/returns/${id}`, { action: "refund" }, admin), { id });
    expect(refund.status).toBe(200);
    expect(refund.data.returnRequest.refundCents).toBe(12500);
    expect(stripe.refunds.at(-1)).toMatchObject({ amount: 12500, idempotencyKey: `trestle:return:${id}` });
    expect((await prisma.cardPayment.findUniqueOrThrow({ where: { id: d.paymentId } })).status).toBe("PARTIALLY_REFUNDED");
  });

  it("admin cancel refunds only a paid, unshipped order and restocks it", async () => {
    const f = await fixtureSeller({ stock: 3 });
    const jar = newJar();
    await addToBag(jar, f.product.variants[0]!.id, 1);
    const start = await startCheckout(jar);
    const p = await prisma.cardPayment.findUniqueOrThrow({ where: { id: start.data.paymentId } });
    await deliver(stripe.sessionEvent("checkout.session.completed", stripe.pay(p.stripeCheckoutSessionId!)));
    const order = await prisma.order.findFirstOrThrow({ where: { cardPaymentId: p.id } });
    const admin = await adminJar();
    const c = await call(adminOrderPOST, post(`/api/admin/orders/${order.id}`, { action: "cancel" }, admin), { id: order.id });
    expect(c.status).toBe(200);
    expect(c.data.refundedCents).toBe(p.totalCents);
    expect(await variantStock(f.product.variants[0]!.id)).toBe(3);
    const twice = await call(adminOrderPOST, post(`/api/admin/orders/${order.id}`, { action: "cancel" }, admin), { id: order.id });
    expect(twice.status).toBe(409);
  });

  it("keeps admin endpoints closed to buyers and sellers, but lets admins edit any product", async () => {
    const f = await fixtureSeller();
    const buyer = await register();
    for (const [h, path] of [
      [adminOrdersGET, "/api/admin/orders"],
      [adminMessagesGET, "/api/admin/messages"],
    ] as const) {
      expect((await call(h, req(path))).status).toBe(401);
      expect((await call(h, req(path, { jar: buyer.jar }))).status).toBe(403);
    }
    const admin = await adminJar();
    const edit = await call(
      productPATCH,
      req(`/api/products/${f.product.id}`, {
        method: "PATCH",
        jar: admin,
        headers: { origin: ORIGIN },
        body: {
          title: "Fixture Tee (edited by admin)",
          description: "A tee used in automated tests.",
          price: "120.00",
          department: "women",
          category: "t-shirts",
          images: [{ url: "/images/catalog/t-shirts-woman-t-shirt_01_1.webp", alt: "Fixture tee", colour: "Black" }],
          variants: f.product.variants.map((v) => ({ id: v.id, sku: v.sku, colour: v.colour!, size: v.size!, stock: 9 })),
        },
      }),
      { id: f.product.id },
    );
    expect(edit.status).toBe(200);
    expect(edit.data.product.priceUsdMicros).toBe("120000000");
    const badPrice = await call(
      productPATCH,
      req(`/api/products/${f.product.id}`, { method: "PATCH", jar: admin, headers: { origin: ORIGIN }, body: { ...{}, title: "x" } }),
      { id: f.product.id },
    );
    expect(badPrice.status).toBe(400);
  });

  it("stores contact messages, validates them and silently drops honeypot hits", async () => {
    const bad = await call(contactPOST, post("/api/contact", { name: "A", email: "not-an-email", topic: "Order", message: "hi" }));
    expect(bad.status).toBe(400);
    const bot = await call(contactPOST, post("/api/contact", { name: "Bot", email: "bot@example.test", topic: "Other", message: "buy cheap things now", website: "x" }));
    expect(bot.status).toBe(400); // non-empty honeypot fails validation
    const ok = await call(contactPOST, post("/api/contact", { name: "Ava", email: "ava@example.test", topic: "Sizing", message: "Is the wide-leg jean long enough?" }));
    expect(ok.status).toBe(200);
    expect(await prisma.contactMessage.count()).toBe(1);
  });
});
