/**
 * Route smoke matrix against a running server: every route at 390 / 768 / 1440 px in light and dark themes.
 * Fails on HTTP errors, uncaught page errors, console errors, horizontal overflow and broken images; runs axe
 * (WCAG 2 A/AA, serious + critical) once per route at 390 and 1440 (light) and writes screenshots.
 *   BASE_URL=http://localhost:3000 OUT_DIR=/tmp/trestle-shots tsx scripts/smoke-pages.ts
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "/tmp/trestle-shots";
mkdirSync(OUT, { recursive: true });

async function main() {
  const prisma = new PrismaClient();
  const cardPayment = await prisma.cardPayment.findFirst({ where: { status: "PAID" }, select: { id: true } });
  const cryptoOrder = await prisma.order.findFirst({ where: { paymentMethod: "CRYPTO" }, select: { id: true } });
  await prisma.$disconnect();
  const routes = [
    "/",
    "/women",
    "/women?category=dresses&colour=Ivory&sort=price-asc",
    "/men",
    "/accessories",
    "/new",
    "/collections",
    "/collections/denim",
    "/search?q=maxi",
    "/products",
    "/products/ribbon-tie-blouse",
    "/products/womens-relaxed-crew-tee",
    "/products/mens-straight-jeans",
    "/bag",
    "/checkout",
    "/checkout/cancelled",
    cardPayment ? `/order-status/${cardPayment.id}` : null,
    "/order-status",
    cryptoOrder ? `/orders/${cryptoOrder.id}` : null,
    "/wishlist",
    "/sign-in",
    "/register",
    "/account",
    "/account/profile",
    "/account/wallet",
    "/account/loyalty",
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
    "/transparency",
    "/seller/onboarding",
    "/seller/products",
    "/admin",
    "/admin/orders",
    "/does-not-exist",
  ].filter(Boolean) as string[];

  const browser = await chromium.launch();
  const failures: string[] = [];
  const axeSummary: Record<string, number> = {};
  for (const w of [390, 768, 1440]) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: w === 390 ? "reduce" : "no-preference" });
      for (const r of routes) {
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
        page.on("console", (m) => {
          if (m.type() === "error" && !/status of 40[134]/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`);
        });
        const res = await page.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 60_000 });
        const status = res?.status() ?? 0;
        if (r === "/does-not-exist" ? status !== 404 : status >= 400) failures.push(`${w} ${scheme} ${r}: HTTP ${status}`);
        // load lazy images, then check for broken ones
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 800) {
            window.scrollTo(0, y);
            await new Promise((res) => setTimeout(res, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(400);
        const broken = await page.evaluate(() =>
          [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc.slice(0, 120)),
        );
        if (broken.length) failures.push(`${w} ${scheme} ${r}: broken images ${broken.join(", ")}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) failures.push(`${w} ${scheme} ${r}: horizontal overflow ${overflow}px`);
        if (errors.length) failures.push(`${w} ${scheme} ${r}: ${errors.join(" | ")}`);
        if (scheme === "light" && (w === 390 || w === 1440)) {
          const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
          const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          axeSummary[`${w} ${r}`] = bad.length;
          for (const v of bad) failures.push(`${w} ${r}: axe ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.nodes[0]?.target.join(" ")}`);
        }
        if (scheme === "light" || r === "/") {
          const name = `${w}-${scheme}${r.replace(/[/?=&]+/g, "_") || "_home"}`.slice(0, 120);
          await page.screenshot({ path: `${OUT}/${name}.png` });
        }
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  const axeTotal = Object.values(axeSummary).reduce((a, b) => a + b, 0);
  console.log(`routes: ${routes.length} × 3 widths × 2 themes; axe serious/critical violations: ${axeTotal}`);
  if (failures.length) {
    console.error(`SMOKE FAILED (${failures.length}):\n` + failures.join("\n"));
    process.exit(1);
  }
  console.log(`SMOKE PASSED — screenshots in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
