/**
 * Browser smoke test: renders every route at desktop + mobile widths in light and dark themes, fails on HTTP
 * errors, uncaught page errors, console errors or horizontal overflow, and writes screenshots.
 *   BASE_URL=http://localhost:3000 OUT_DIR=/tmp/shots tsx scripts/smoke-pages.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "/tmp/trestle-shots";
mkdirSync(OUT, { recursive: true });

async function main() {
  const prisma = new PrismaClient();
  const product = await prisma.product.findFirst({
    where: { certificates: { some: {} } },
    select: { id: true },
  });
  await prisma.$disconnect();
  const routes = [
    "/",
    "/products",
    "/products?category=Sneakers&sort=price-asc",
    product ? `/products/${product.id}` : null,
    "/cart",
    "/checkout?seller=x",
    "/account",
    "/account/loyalty",
    "/seller/onboarding",
    "/seller/products",
    "/seller/orders",
    "/seller/analytics",
    "/admin/disputes",
    "/admin/sellers",
    "/admin/transparency",
    "/does-not-exist",
  ].filter(Boolean) as string[];

  const browser = await chromium.launch();
  const failures: string[] = [];
  for (const viewport of [
    { w: 1366, h: 900, tag: "desktop" },
    { w: 390, h: 844, tag: "mobile" },
  ]) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({
        viewport: { width: viewport.w, height: viewport.h },
        colorScheme: scheme,
      });
      for (const r of routes) {
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
        page.on("console", (m) => {
          if (
            m.type() === "error" &&
            !/Failed to load resource: the server responded with a status of 404/.test(m.text())
          )
            errors.push(`console: ${m.text().slice(0, 200)}`);
        });
        let res = null;
        try {
          res = await page.goto(BASE + r, { waitUntil: "load", timeout: 90_000 });
          await page.waitForTimeout(1_200); // let client components hydrate / fetch
        } catch (e) {
          errors.push(`navigation: ${(e as Error).message.split("\n")[0]}`);
        }
        const status = res?.status() ?? 0;
        const overflow = await page
          .evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          .catch(() => -1);
        const h1 = await page
          .locator("h1")
          .first()
          .textContent({ timeout: 5_000 })
          .catch(() => null);
        const expected404 = r === "/does-not-exist";
        if (expected404) {
          // Coinbase Wallet SDK probes the current URL for its COOP header; on an intentional 404 page that probe
          // logs a console error. It is third-party noise specific to this route, so it's excluded here only.
          for (let i = errors.length - 1; i >= 0; i--)
            if (errors[i]!.includes("Cross-Origin-Opener-Policy")) errors.splice(i, 1);
        }
        const ok =
          (expected404 ? status === 404 : status === 200) && errors.length === 0 && overflow <= 1;
        const name = `${viewport.tag}-${scheme}-${r.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "home"}.png`;
        if (scheme === "light" || r === "/" || r.startsWith("/admin/transparency")) {
          await page
            .screenshot({ path: `${OUT}/${name}`, fullPage: false, timeout: 15_000 })
            .catch(() => undefined);
        }
        console.log(
          `${ok ? "PASS" : "FAIL"} ${viewport.tag}/${scheme} ${r} → ${status} h1="${(h1 ?? "").trim().slice(0, 50)}" overflow=${overflow}px${errors.length ? " errors=" + JSON.stringify(errors) : ""}`,
        );
        if (!ok) failures.push(`${viewport.tag}/${scheme} ${r}`);
        await page.close().catch(() => undefined);
      }
      await ctx.close();
    }
  }
  await browser.close();
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n` + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nAll routes passed.");
}
main();
