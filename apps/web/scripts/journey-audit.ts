/**
 * Real-browser journey audit: clicks every visible navigation item and the main shopping controls, and checks the
 * OUTCOME (URL, rendered heading, persisted state), not just that a click fired. Records HTTP errors, console and
 * page errors, failed requests and timings.
 *
 *   BASE_URL=https://… tsx scripts/journey-audit.ts            # read-only (safe against a live deployment)
 *   BASE_URL=http://localhost:3000 AUDIT_MUTATE=1 tsx …        # also bag / wishlist / account flows (isolated DB only)
 *
 * Exit code 1 when any check fails. Card payments are expected to be DISABLED unless AUDIT_EXPECT_CARD=1.
 */
import { chromium, devices, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MUTATE = process.env.AUDIT_MUTATE === "1";
const NAV_TIMEOUT = Number(process.env.AUDIT_NAV_TIMEOUT ?? 15_000);
const failures: string[] = [];
const notes: string[] = [];
const timings: { what: string; ms: number }[] = [];

function fail(msg: string) {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}
function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(`${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

/** Roughly "Slow 4G": 400 ms extra latency per request, ~1.6 Mbit/s down (AUDIT_SLOW_NETWORK=1). */
async function throttle(page: Page) {
  if (process.env.AUDIT_SLOW_NETWORK !== "1") return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: 200_000,
    uploadThroughput: 90_000,
  });
}

function instrument(page: Page, label: string) {
  page.on("pageerror", (e) =>
    fail(`[${label}] pageerror @ ${new URL(page.url()).pathname}: ${e.message.slice(0, 160)}`),
  );
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // expected: anonymous session probes and guarded endpoints answer 401/403/404 by design
    if (/status of (401|403|404)/.test(t)) return;
    fail(`[${label}] console @ ${new URL(page.url()).pathname}: ${t.slice(0, 160)}`);
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin) return;
    if (r.status() >= 500) {
      const where = `[${label}] HTTP ${r.status()} ${u.pathname}${u.search}`;
      r.text()
        .then((t) => fail(`${where} ${/"ref":"([^"]+)"/.exec(t)?.[1] ?? ""}`.trim()))
        .catch(() => fail(where));
    }
  });
  page.on("requestfailed", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin) return;
    const err = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(err)) return; // superseded prefetches/navigations
    fail(`[${label}] request failed ${u.pathname}: ${err}`);
  });
}

async function timed<T>(what: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const r = await fn();
  timings.push({ what, ms: Date.now() - t });
  return r;
}

/** Click and require the URL to match and a heading to render. */
async function clickTo(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  url: RegExp,
  what: string,
) {
  await timed(what, async () => {
    await Promise.all([
      page.waitForURL(url, { timeout: NAV_TIMEOUT, waitUntil: "commit" }),
      locator.click(),
    ]);
    await page.locator("main h1, main h2").first().waitFor({ timeout: NAV_TIMEOUT });
  });
}

async function desktop(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await throttle(page);
  instrument(page, "desktop");
  // escrow-only surfaces exist only where stablecoin payments are live on the deployment
  const cryptoLive = await page.request
    .get(BASE + "/api/checkout/options")
    .then(
      async (r) =>
        ((await r.json()) as { crypto?: { enabled?: boolean } }).crypto?.enabled === true,
    )
    .catch(() => true);
  console.log("\n— routes (status, TTFB)");
  const routes = [
    "/",
    "/women",
    "/men",
    "/accessories",
    "/new",
    "/collections",
    "/search?q=dress",
    "/bag",
    "/wishlist",
    "/checkout",
    "/sign-in",
    "/register",
    "/forgot-password",
    "/help",
    "/contact",
    "/size-guide",
    "/care",
    "/delivery",
    "/returns",
    "/payments",
    "/privacy",
    "/terms",
    "/credits",
    "/order-status",
    "/transparency",
    "/does-not-exist",
  ];
  for (const r of routes) {
    await check(`GET ${r}`, async () => {
      const t = Date.now();
      const res = await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const ms = Date.now() - t;
      timings.push({ what: `load ${r}`, ms });
      const want = r === "/does-not-exist" || (r === "/transparency" && !cryptoLive) ? 404 : 200;
      if (res?.status() !== want) throw new Error(`status ${res?.status()} (want ${want})`);
      await page.locator("h1").first().waitFor({ timeout: 10_000 });
    });
  }

  console.log("\n— header navigation");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  for (const [label, url] of [
    ["New in", /\/new$/],
    ["Collections", /\/collections$/],
  ] as const) {
    await check(`header link ${label}`, () =>
      clickTo(
        page,
        page
          .getByRole("navigation", { name: "Main" })
          .getByRole("link", { name: label, exact: true }),
        url,
        `nav ${label}`,
      ),
    );
  }
  for (const dept of ["Women", "Men", "Accessories"]) {
    await check(`mega menu ${dept}`, async () => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const nav = page.getByRole("navigation", { name: "Main" });
      await nav.getByRole("button", { name: dept, exact: true }).click();
      const link = nav
        .getByRole("link")
        .filter({ hasText: /^(All|Shop all|View all)/i })
        .first();
      const any = (await link.count())
        ? link
        : nav.locator("[data-state=open] a, [role=menu] a").first();
      await any.waitFor({ timeout: 5000 });
      const href = (await any.getAttribute("href")) ?? "";
      await clickTo(page, any, new RegExp(href.replace(/[?]/g, "\\?") + "$"), `mega ${dept}`);
    });
  }
  await check("logo returns home", async () => {
    await page.goto(BASE + "/women", { waitUntil: "domcontentloaded" });
    await clickTo(
      page,
      page.getByRole("link", { name: /Trestle — home/ }),
      new RegExp(`^${BASE}/?$`),
      "logo",
    );
  });

  console.log("\n— footer links (every href loads with a heading)");
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const hrefs = [
    ...new Set(
      await page
        .locator("footer a[href^='/']")
        .evaluateAll((as) => as.map((a) => a.getAttribute("href")!)),
    ),
  ];
  for (const h of hrefs) {
    await check(`footer ${h}`, async () => {
      // a real page load (hosting firewalls may challenge non-browser clients)
      const res = await page.goto(BASE + h, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (res?.status() !== 200) throw new Error(`status ${res?.status()}`);
      await page.locator("h1").first().waitFor({ timeout: 10_000 });
    });
  }

  console.log("\n— listing: filters, sort, chips, load more, density, back/forward");
  await check("category chip navigates", async () => {
    await page.goto(BASE + "/women", { waitUntil: "networkidle" });
    await clickTo(
      page,
      page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Dresses" }),
      /category=dresses/,
      "chip",
    );
    const n = await page.locator("[data-product-grid] > li").count();
    if (!n) throw new Error("no products after chip");
  });
  await check("filter sheet applies colour + sort", async () => {
    await page.goto(BASE + "/women", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Filter & sort/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /Price, low to high/ }).click();
    await dialog.getByRole("checkbox").first().click();
    await timed("filter apply", async () => {
      await dialog.getByRole("button", { name: /Show \d+ product|Show results|Apply/ }).click();
      await page.waitForURL(/sort=price-asc/, { timeout: NAV_TIMEOUT });
    });
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
  });
  await check("load more appends products", async () => {
    await page.goto(BASE + "/women", { waitUntil: "networkidle" });
    const before = await page.locator("[data-product-grid] > li").count();
    const more = page.getByRole("link", { name: "Load more" });
    if (!(await more.count())) return;
    await more.click();
    await page.waitForURL(/page=2/, { timeout: NAV_TIMEOUT });
    await page.waitForFunction(
      (b) => document.querySelectorAll("[data-product-grid] > li").length > b,
      before,
      { timeout: NAV_TIMEOUT },
    );
  });
  await check("grid density toggles and persists", async () => {
    await page.goto(BASE + "/men", { waitUntil: "networkidle" });
    await page.getByRole("radio", { name: "Larger images" }).click();
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>("[data-product-grid]")?.dataset.density === "large",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    const d = await page.locator("[data-product-grid]").getAttribute("data-density");
    await page.getByRole("radio", { name: "Smaller images" }).click();
    if (d !== "large") throw new Error(`after reload density=${d}`);
  });
  await check("back/forward between listing and PDP", async () => {
    await page.goto(BASE + "/women", { waitUntil: "networkidle" });
    const first = page.locator("[data-product-grid] article h3 a").first();
    await clickTo(page, first, /\/products\//, "card → PDP");
    await page.goBack();
    await page.waitForURL(/\/women/, { timeout: NAV_TIMEOUT });
    await page.locator("[data-product-grid]").waitFor({ timeout: NAV_TIMEOUT });
    await page.goForward();
    await page.waitForURL(/\/products\//, { timeout: NAV_TIMEOUT });
    await page.locator("main h1").waitFor({ timeout: NAV_TIMEOUT });
  });
  await check("rapid repeated navigation settles on the last click", async () => {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "New in", exact: true }).click();
    await nav.getByRole("link", { name: "Collections", exact: true }).click();
    await nav.getByRole("link", { name: "New in", exact: true }).click();
    await page.waitForURL(/\/new$/, { timeout: NAV_TIMEOUT });
    await page
      .getByRole("heading", { level: 1, name: /New in/i })
      .waitFor({ timeout: NAV_TIMEOUT });
  });

  await check("rapid back/forward settles on the right page", async () => {
    await page.goto(BASE + "/women", { waitUntil: "networkidle" });
    await page.locator("[data-product-grid] article h3 a").first().click();
    await page.waitForURL(/\/products\//, { timeout: NAV_TIMEOUT, waitUntil: "commit" });
    // ~150 ms apart: fast for a person; with 0 ms Chrome itself drops overlapping history traversals
    await page.goBack({ waitUntil: "commit" });
    await page.waitForTimeout(150);
    await page.goForward({ waitUntil: "commit" });
    await page.waitForTimeout(150);
    await page.goBack({ waitUntil: "commit" });
    await page.waitForURL(/\/women/, { timeout: NAV_TIMEOUT });
    await page.getByRole("heading", { level: 1, name: "Women" }).waitFor({ timeout: NAV_TIMEOUT });
    await page.locator("[data-product-grid] > li").first().waitFor({ timeout: NAV_TIMEOUT });
  });

  console.log("\n— search");
  await check("search overlay → results → product", async () => {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("searchbox").fill("jeans");
    const result = page.getByRole("dialog").locator("a[href^='/products/']").first();
    await result.waitFor({ timeout: NAV_TIMEOUT });
    await clickTo(page, result, /\/products\//, "search result");
  });
  await check("search submit → results page", async () => {
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("searchbox").fill("tee");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/search\?q=tee/, { timeout: NAV_TIMEOUT });
    await page.locator("[data-product-grid] > li").first().waitFor({ timeout: NAV_TIMEOUT });
  });

  console.log("\n— product page");
  await check("PDP colour, size guide, zoom", async () => {
    await page.goto(BASE + "/products/mens-heavyweight-tee", { waitUntil: "networkidle" });
    const colours = page.getByRole("radiogroup", { name: /Colour/ }).getByRole("radio");
    if ((await colours.count()) > 1) {
      await colours.nth(1).click();
      await page.waitForURL(/colour=/, { timeout: 5000 });
    }
    await page.getByRole("button", { name: /Size guide/ }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: /^Zoom image 1/ })
      .last()
      .click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  });

  console.log("\n— checkout availability");
  await check("checkout explains card payments are unavailable (no dead button)", async () => {
    await page.goto(BASE + "/checkout", { waitUntil: "networkidle" });
    const body = await page.locator("main").innerText();
    if (process.env.AUDIT_EXPECT_CARD === "1") return;
    if (!/bag is empty|not (available|configured|enabled)|unavailable/i.test(body))
      throw new Error(
        "checkout neither shows an empty bag nor explains that card payment is unavailable",
      );
  });

  if (MUTATE) await mutating(page);
  await page.close();
}

/**
 * Repeated audits register from the same IP and hit the real sign-up limit. Clear only those counters, and only
 * when both the site and the database are on this machine — never against a hosted deployment.
 */
async function resetLocalAuthRateLimits() {
  const db = process.env.DATABASE_URL ?? "";
  if (
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE) ||
    !/@(localhost|127\.0\.0\.1)[:/]/.test(db)
  )
    return;
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "AppKV" WHERE "key" LIKE 'rl:register:%' OR "key" LIKE 'rl:login%'`,
    );
  } catch {
    /* KV not in this database (Redis/Upstash) */
  } finally {
    await prisma.$disconnect();
  }
}

async function mutating(page: Page) {
  console.log("\n— bag, wishlist, account (mutating; isolated database only)");
  await check("PDP add to bag → drawer shows the item", async () => {
    await page.goto(BASE + "/products/mens-heavyweight-tee", { waitUntil: "networkidle" });
    const sizes = page.getByRole("radiogroup", { name: /Size/ }).getByRole("radio");
    const n = await sizes.count();
    for (let i = 0; i < n; i++)
      if (await sizes.nth(i).isEnabled()) {
        await sizes.nth(i).click();
        break;
      }
    await timed("add to bag", async () => {
      await page
        .getByRole("button", { name: /^Add to bag/ })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByText("Heavyweight tee")
        .first()
        .waitFor({ timeout: NAV_TIMEOUT });
    });
    await page.keyboard.press("Escape");
  });
  await check("bag quantity + / − / remove persist across reload", async () => {
    await page.goto(BASE + "/bag", { waitUntil: "networkidle" });
    const line = page.locator("main li").filter({ hasText: "Heavyweight tee" }).first();
    await line.getByRole("button", { name: /Increase quantity/ }).click();
    await line.getByText("2", { exact: true }).waitFor({ timeout: NAV_TIMEOUT });
    await page.reload({ waitUntil: "networkidle" });
    await page
      .locator("main li")
      .filter({ hasText: "Heavyweight tee" })
      .first()
      .getByText("2", { exact: true })
      .waitFor({ timeout: NAV_TIMEOUT });
    const l2 = page.locator("main li").filter({ hasText: "Heavyweight tee" }).first();
    await l2.getByRole("button", { name: /Decrease quantity/ }).click();
    await l2.getByText("1", { exact: true }).waitFor({ timeout: NAV_TIMEOUT });
    await l2.getByRole("button", { name: /Remove/ }).click();
    await page.getByText(/bag is empty/i).waitFor({ timeout: NAV_TIMEOUT });
  });
  await check("quick add from a card", async () => {
    await page.goto(BASE + "/men", { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /^Quick add/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog");
    await sheet
      .getByRole("button", { name: /^Size [^,]+$/ })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByText(/Bag \(1\)/)
      .first()
      .waitFor({ timeout: NAV_TIMEOUT });
    await page.keyboard.press("Escape");
  });
  await check("bag empties again (test data removed)", async () => {
    await page.goto(BASE + "/bag", { waitUntil: "networkidle" });
    for (let i = 0; i < 10 && !(await page.getByText(/bag is empty/i).isVisible()); i++) {
      await page
        .locator("main")
        .getByRole("button", { name: /Remove/ })
        .first()
        .click();
      await page.waitForTimeout(800);
    }
    await page.getByText(/bag is empty/i).waitFor({ timeout: NAV_TIMEOUT });
  });
  await check("wishlist heart persists to /wishlist", async () => {
    await page.goto(BASE + "/women", { waitUntil: "networkidle" });
    const heart = page.getByRole("button", { name: /^Save .* to wishlist$/ }).first();
    const label = (await heart.getAttribute("aria-label"))!.replace(/^Save | to wishlist$/g, "");
    await heart.click();
    await page.goto(BASE + "/wishlist", { waitUntil: "networkidle" });
    await page.getByText(label).first().waitFor({ timeout: NAV_TIMEOUT });
  });
  await resetLocalAuthRateLimits();
  // clearly labelled, non-routable test address (RFC 2606) — deleted again at the end of this section
  const email = `trestle-audit+${Date.now()}@example.test`;
  await check("register → account → profile → sign out → sign in", async () => {
    await page.goto(BASE + "/register", { waitUntil: "networkidle" });
    await page.getByLabel("Name").fill("Audit Shopper");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("audit password 123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account$/, { timeout: NAV_TIMEOUT });
    await page.locator("main h1").waitFor({ timeout: NAV_TIMEOUT });
    await clickTo(
      page,
      page.getByRole("link", { name: /Profile/ }).first(),
      /\/account\/profile/,
      "profile",
    );
    await page
      .getByRole("button", { name: /Sign out/ })
      .first()
      .click();
    await page.waitForURL((u) => !u.pathname.startsWith("/account"), { timeout: NAV_TIMEOUT });
    await page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("audit password 123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account$/, { timeout: NAV_TIMEOUT });
  });
  await check("wrong password shows an error, not a hang", async () => {
    const ctx = page.context();
    await ctx.clearCookies();
    await page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("definitely wrong 1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("alert").waitFor({ timeout: NAV_TIMEOUT });
  });
  await check("delete the test account from Profile, then it can no longer sign in", async () => {
    await page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("audit password 123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account$/, { timeout: NAV_TIMEOUT });
    await page.goto(BASE + "/account/profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Delete my account/ }).click();
    await page.getByLabel("Confirm with your password").fill("audit password 123");
    await page.getByRole("button", { name: "Permanently delete account" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: NAV_TIMEOUT });
    await page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("audit password 123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("alert").waitFor({ timeout: NAV_TIMEOUT });
  });
  await check("admin area is protected for anonymous visitors", async () => {
    await page.context().clearCookies();
    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    const text = await page.locator("main").innerText();
    if (!/sign in|not allowed|permission|admin/i.test(text))
      throw new Error("admin page rendered without a sign-in gate");
    const api = await page.request.get(BASE + "/api/admin/overview");
    if (![401, 403].includes(api.status()))
      throw new Error(`/api/admin/overview → ${api.status()}`);
  });
}

async function mobile(ctx: BrowserContext, width: number) {
  const page = await ctx.newPage();
  await throttle(page);
  instrument(page, `m${width}`);
  console.log(`\n— ${width}px: menu, theme, listing`);
  await check(`${width}: mobile menu opens and navigates`, async () => {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open menu" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /Women/i }).first().click();
    const link = dlg.locator("a[href^='/women']").first();
    await clickTo(page, link, /\/women/, `m${width} menu`);
    await dlg.waitFor({ state: "hidden", timeout: 5000 });
  });
  await check(`${width}: theme toggle switches to dark`, async () => {
    await page.getByRole("radio", { name: "Dark theme" }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
    await page.getByRole("radio", { name: "System theme" }).click();
  });
  await check(`${width}: product card opens PDP`, async () => {
    await page.goto(BASE + "/men", { waitUntil: "networkidle" });
    await clickTo(
      page,
      page.locator("[data-product-grid] article h3 a").first(),
      /\/products\//,
      `m${width} card`,
    );
  });
  await page.close();
}

async function main() {
  console.log(`Journey audit → ${BASE}${MUTATE ? " (mutating)" : " (read-only)"}`);
  const browser = await chromium.launch();
  const reduced = process.env.AUDIT_REDUCED_MOTION === "1" ? "reduce" : "no-preference";
  const d = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reduced,
  });
  await desktop(d);
  await d.close();
  for (const w of [390, 768]) {
    const m = await browser.newContext({
      ...(w === 390 ? devices["iPhone 13"] : {}),
      viewport: { width: w, height: 900 },
      reducedMotion: reduced,
    });
    await mobile(m, w);
    await m.close();
  }
  await browser.close();
  const sorted = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 12);
  console.log("\nslowest steps:");
  for (const t of sorted) console.log(`  ${String(t.ms).padStart(6)} ms  ${t.what}`);
  for (const n of notes) console.log(`note: ${n}`);
  console.log(
    failures.length
      ? `\nJOURNEY AUDIT FAILED — ${failures.length} problem(s)`
      : "\nJOURNEY AUDIT PASSED",
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
