/**
 * Browser E2E against a running PRODUCTION server (next start) — storefront, guest card checkout, cancel,
 * registration + bag merge, wishlist, admin fulfilment and a full return/refund.
 *
 * Card payments use test/mock-stripe.ts (a LOCAL MOCK of the Stripe API started by this script on :12111).
 * The server must run with STRIPE_SECRET_KEY=sk_test_mock…, STRIPE_WEBHOOK_SECRET=whsec_test_mock…,
 * STRIPE_API_BASE=http://127.0.0.1:12111. Webhooks are signed with the real Stripe SDK helper and verified
 * by the server. This is NOT a real Stripe transaction.
 *
 *   BASE_URL=http://localhost:3000 DATABASE_URL=… tsx scripts/store-e2e.ts
 */
import { chromium, type Page } from "playwright";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { MockStripe } from "../test/mock-stripe";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_mock_0000000000000000000000000";
const prisma = new PrismaClient();
const mock = new MockStripe();
const sdk = new Stripe("sk_test_mock_0000000000000000000000000000");
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

async function deliver(event: unknown) {
  const payload = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sdk.webhooks.generateTestHeaderString({ payload, secret: WHSEC }) },
    body: payload,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`webhook ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function mockStripeCheckout(page: Page) {
  await page.route("https://checkout.stripe.test/**", (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><body><h1>Mock Stripe Checkout (test harness)</h1></body></html>" }),
  );
}

async function inStockVariantSize(slug: string) {
  const p = await prisma.product.findUniqueOrThrow({ where: { slug }, include: { variants: { orderBy: { position: "asc" } } } });
  const colour = p.variants.find((v) => v.stock > 0)!.colour;
  return p.variants.find((v) => v.colour === colour && v.stock > 1)!;
}

async function addToBagFromPdp(page: Page, slug: string) {
  const v = await inStockVariantSize(slug);
  await page.goto(`${BASE}/products/${slug}?colour=${encodeURIComponent(v.colour!)}`, { waitUntil: "networkidle" });
  if (v.size !== "One size") await page.getByRole("radio", { name: new RegExp(`^Size ${v.size}(,|$)`) }).first().click();
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page.getByRole("dialog", { name: /Bag/ }).waitFor();
  await page.keyboard.press("Escape");
  return v;
}

async function main() {
  await mock.start(12111);
  const browser = await chromium.launch();
  const errors: string[] = [];
  const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await guest.newPage();
  current = page;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/status of 40[134]/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  await mockStripeCheckout(page);

  // ---------------------------------------------------------------- browse, filter, sort (URL-backed)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  if (!(await page.getByRole("link", { name: "Skip to content" }).evaluate((el) => el === document.activeElement)))
    throw new Error("skip link is not the first focus stop");
  await page.goto(`${BASE}/women`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Filter & sort/ }).click();
  await page.getByRole("button", { name: "Black", exact: true }).click();
  await page.getByLabel("Price, low to high").check();
  await page.getByRole("button", { name: "Show results" }).click();
  await page.waitForURL(/colour=Black/, { waitUntil: "commit" });
  if (!/sort=price-asc/.test(page.url())) throw new Error("sort not in URL");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Remove filter Black" }).waitFor();
  log(`filters persisted in URL: ${page.url().replace(BASE, "")}`);

  // search overlay
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByLabel("Search products").fill("maxi");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=maxi/, { waitUntil: "commit" });
  await page.getByText(/Results for “maxi”/).waitFor();
  log("search works");

  // ---------------------------------------------------------------- PDP: sold-out size, add to bag, wishlist
  await page.goto(`${BASE}/products/tiered-cami-dress`, { waitUntil: "networkidle" });
  const soldOut = page.getByRole("radio", { name: /Size M, sold out/ });
  if (!(await soldOut.isDisabled())) throw new Error("sold-out size is selectable");
  await page.getByRole("button", { name: "Select a size" }).click();
  await page.getByText("Please choose a size.").waitFor();
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  const v1 = await addToBagFromPdp(page, "womens-relaxed-crew-tee");
  await page.goto(`${BASE}/bag`, { waitUntil: "networkidle" });
  await page.getByText("Relaxed crew-neck tee").first().waitFor();
  log(`bag persists across reload (variant ${v1.sku})`);
  await page.goto(`${BASE}/wishlist`, { waitUntil: "networkidle" });
  await page.getByText("Tiered cami dress").first().waitFor();
  log("guest wishlist persists");

  // ---------------------------------------------------------------- guest card checkout (mock Stripe)
  const stockBefore = (await prisma.productVariant.findUniqueOrThrow({ where: { id: v1.id } })).stock;
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("guest-e2e@example.test");
  await page.getByRole("button", { name: /Continue to secure payment/ }).click();
  await page.waitForURL(/checkout\.stripe\.test/);
  const pay1 = await prisma.cardPayment.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  if ((await prisma.productVariant.findUniqueOrThrow({ where: { id: v1.id } })).stock !== stockBefore - 1)
    throw new Error("stock not reserved");
  // success URL before the webhook: must not show paid
  await page.goto(`${BASE}/checkout/complete?payment=${pay1.id}`, { waitUntil: "networkidle" });
  await page.getByText("Confirming your payment…").waitFor();
  const s1 = mock.pay(pay1.stripeCheckoutSessionId!);
  const r = await deliver(mock.sessionEvent("checkout.session.completed", s1, { email: "guest-e2e@example.test" }));
  await page.getByText("Thank you — your order is confirmed").waitFor({ timeout: 15_000 });
  await page.getByLabel("Private order link").waitFor();
  log(`guest card checkout confirmed by signed webhook (${r.outcome})`);

  // ---------------------------------------------------------------- cancel releases stock
  await addToBagFromPdp(page, "mens-heavyweight-tee");
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("guest-e2e@example.test");
  await page.getByRole("button", { name: /Continue to secure payment/ }).click();
  await page.waitForURL(/checkout\.stripe\.test/);
  const pay2 = await prisma.cardPayment.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  await page.goto(`${BASE}/checkout/cancelled?payment=${pay2.id}`, { waitUntil: "networkidle" });
  await page.getByText("No payment was taken. Your bag still has everything in it.").waitFor();
  if ((await prisma.cardPayment.findUniqueOrThrow({ where: { id: pay2.id } })).status !== "EXPIRED") throw new Error("not expired");
  log("cancel expired the session and released stock");

  // ---------------------------------------------------------------- register → bag merge, account order claim
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  const email = `e2e${Date.now()}@example.test`;
  await page.getByLabel("Name").fill("E2E Shopper");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e password 123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account$/, { waitUntil: "commit" });
  await page.goto(`${BASE}/bag`, { waitUntil: "networkidle" });
  await page.getByText("Heavyweight tee").first().waitFor();
  log("guest bag merged into new account");
  await page.goto(`${BASE}/order-status/${pay1.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Save to my account" }).click();
  await page.getByText("Order saved to your account").waitFor();
  await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
  await page.getByText("Relaxed crew-neck tee").first().waitFor();
  log("guest order claimed into account history");

  // ---------------------------------------------------------------- admin fulfils, buyer returns, admin refunds
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  admin.on("pageerror", (e) => errors.push(`admin pageerror: ${e.message}`));
  await admin.goto(`${BASE}/sign-in?next=/admin`, { waitUntil: "networkidle" });
  await admin.getByLabel("Email").fill("admin@trestle.local");
  await admin.getByLabel("Password").fill(process.env.SEED_DEMO_PASSWORD ?? "trestle-demo-password");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(/\/admin$/, { waitUntil: "commit" });
  await admin.getByText("Paid orders to ship").waitFor();
  const order = await prisma.order.findFirstOrThrow({ where: { cardPaymentId: pay1.id } });
  await admin.goto(`${BASE}/admin/orders/${order.id}`, { waitUntil: "networkidle" });
  await admin.getByLabel("Tracking number").fill("1Z999AA10123456784");
  await admin.getByRole("button", { name: "Mark shipped" }).click();
  await admin.getByRole("button", { name: "Mark delivered" }).click();
  await admin.getByText(/Delivered/).first().waitFor();
  log("admin shipped and delivered the card order");

  await page.goto(`${BASE}/order-status/${pay1.id}`, { waitUntil: "networkidle" });
  await page.getByText("1Z999AA10123456784").waitFor();
  await page.getByRole("button", { name: "Request a return" }).click();
  await page.locator("select[id^=rq-]").first().selectOption("1");
  await page.getByRole("button", { name: "Submit return request" }).click();
  await page.getByText("Return requested").first().waitFor();
  log("buyer requested a return");

  await admin.goto(`${BASE}/admin/returns`, { waitUntil: "networkidle" });
  const row = admin.locator("li", { has: admin.getByRole("link", { name: order.id }) }).first();
  await row.getByRole("button", { name: "Approve" }).click();
  await row.getByRole("button", { name: /Mark received/ }).click();
  await row.getByRole("button", { name: /^Refund/ }).click();
  await row.getByText(/Refunded \$/).waitFor();
  let refund = mock.refunds.at(-1);
  for (let k = 0; k < 20 && !refund; k++) {
    await new Promise((r) => setTimeout(r, 250));
    refund = mock.refunds.at(-1);
  }
  if (!refund) throw new Error("no refund reached the mock");
  log(`admin refund issued through (mock) Stripe: ${refund.amount} cents, key ${refund.idempotencyKey}`);

  // admin product edit is reachable with the upload control
  await admin.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  await admin.getByRole("link", { name: /Edit Ribbon-tie blouse/ }).click();
  await admin.getByText(/Upload images|Image uploads are not configured/).first().waitFor();
  log("admin product editor + upload control render");

  await browser.close();
  await mock.stop();
  await prisma.$disconnect();
  if (errors.length) throw new Error(`browser errors:\n${errors.join("\n")}`);
  log("STORE E2E PASSED");
}

let current: Page | undefined;
main().catch(async (e) => {
  console.error("STORE E2E FAILED:", e);
  if (current) {
    await current.screenshot({ path: "/tmp/store-e2e-failure.png" }).catch(() => undefined);
    console.error("at URL", current.url());
  }
  await mock.stop().catch(() => undefined);
  process.exit(1);
});
