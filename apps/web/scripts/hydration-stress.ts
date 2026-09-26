/**
 * Slow-4G hydration stress: repeats the listing journeys that reproduced React #418 (density cookie variants,
 * query-string listings, density toggle + reload, rapid navigation, back/forward + reload) and counts
 * hydration errors. Read-only against any BASE_URL (only a first-party layout cookie is written).
 *
 *   BASE_URL=https://… SESSIONS=9 tsx scripts/hydration-stress.ts      (exit 1 when any #418/#423/#425 occurs)
 */
import { chromium, type Browser } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SESSIONS = Number(process.env.SESSIONS ?? 9);
const SLOW = {
  offline: false,
  latency: 400,
  downloadThroughput: 200_000,
  uploadThroughput: 90_000,
};
const hits: string[] = [];
let loads = 0;

async function session(browser: Browser, k: number) {
  const ctx = await browser.newContext({
    viewport: { width: k % 3 === 2 ? 390 : 1440, height: 900 },
  });
  if (k % 2)
    await ctx.addCookies([
      { name: "trestle_grid", value: k % 4 === 1 ? "standard" : "large", url: BASE },
    ]);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.emulateNetworkConditions", SLOW);
  p.on("pageerror", (e) => {
    if (/Minified React error #(418|423|425)|Hydration failed/.test(e.message))
      hits.push(`${p.url().replace(BASE, "")}: ${e.message.slice(0, 60)}`);
  });
  const go = async (u: string) => {
    loads++;
    await p.goto(BASE + u, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => undefined);
  };
  for (const u of [
    "/women",
    "/women?category=dresses",
    "/women?page=2",
    "/women?sort=price-asc&colour=Black",
    "/men",
    "/",
  ])
    await go(u);
  await p.goto(BASE + "/women", { waitUntil: "networkidle" }).catch(() => undefined);
  await p
    .getByRole("radio", { name: "Larger images" })
    .click()
    .catch(() => undefined);
  await p.waitForTimeout(1500);
  loads++;
  await p.reload({ waitUntil: "networkidle" }).catch(() => undefined);
  await p
    .getByRole("radio", { name: "Smaller images" })
    .click()
    .catch(() => undefined);
  const nav = p.getByRole("navigation", { name: "Main" });
  await nav
    .getByRole("link", { name: "New in", exact: true })
    .click()
    .catch(() => undefined);
  await nav
    .getByRole("link", { name: "Collections", exact: true })
    .click()
    .catch(() => undefined);
  await p.waitForTimeout(3000);
  await go("/women");
  await p
    .locator("[data-product-grid] article h3 a")
    .first()
    .click()
    .catch(() => undefined);
  await p.waitForTimeout(3000);
  await p.goBack().catch(() => undefined);
  await p.waitForTimeout(300);
  await p.goForward().catch(() => undefined);
  await p.waitForTimeout(300);
  await p.goBack().catch(() => undefined);
  await p.waitForTimeout(3000);
  loads++;
  await p.reload({ waitUntil: "networkidle" }).catch(() => undefined);
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  for (let i = 0; i < SESSIONS; i += 3)
    await Promise.all(
      [0, 1, 2].filter((j) => i + j < SESSIONS).map((j) => session(browser, i + j)),
    );
  await browser.close();
  console.log(`${loads} full page loads under Slow-4G; hydration errors: ${hits.length}`);
  for (const h of hits) console.log(`  ${h}`);
  process.exit(hits.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
