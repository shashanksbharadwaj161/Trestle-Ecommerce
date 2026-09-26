/**
 * Browser end-to-end checkout through the real UI (Playwright + an injected EIP-1193 wallet backed by Anvil's
 * unlocked dev accounts). Requires the app, both Anvil chains and the relayer to be running.
 *
 *   BASE_URL=http://localhost:3000 tsx scripts/ui-e2e.ts
 *
 * Flow: product page → choose size → Add to bag → /checkout → "Stablecoin escrow" → Pay with stablecoin →
 * Connect (RainbowKit "Browser Wallet") → Sign-In with Ethereum → shipping →
 * choose "ETH from Local B" (cross-chain to a seller paid on Local A) → Confirm & sign → live settlement tracker
 * reaches "Escrowed" → order page → gasless "Confirm delivery" (ERC-4337) → order Completed.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "/tmp/trestle-shots";
const BUYER = (process.env.UI_BUYER ?? "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc").toLowerCase(); // Anvil #5 (Ava)
const RPC: Record<number, string> = {
  31337: "http://127.0.0.1:8545",
  31338: "http://127.0.0.1:8546",
};

function walletShim(account: string, rpcs: Record<number, string>, startChain: number) {
  return `(() => {
    const rpcs = ${JSON.stringify(rpcs)};
    let chainId = ${startChain};
    const listeners = {};
    const emit = (ev, v) => (listeners[ev] || []).forEach((f) => { try { f(v); } catch (e) {} });
    let id = 1;
    async function rpc(method, params) {
      const res = await fetch(rpcs[chainId], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params || [] }) });
      const j = await res.json();
      if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
      return j.result;
    }
    const provider = {
      isMetaMask: false,
      isTrestleTestWallet: true,
      async request({ method, params }) {
        switch (method) {
          case "eth_requestAccounts": case "eth_accounts": return ["${account}"];
          case "eth_chainId": return "0x" + chainId.toString(16);
          case "net_version": return String(chainId);
          case "wallet_switchEthereumChain": {
            const next = parseInt(params[0].chainId, 16);
            if (!rpcs[next]) { const e = new Error("Unrecognized chain"); e.code = 4902; throw e; }
            chainId = next; emit("chainChanged", "0x" + next.toString(16)); return null;
          }
          case "wallet_addEthereumChain": return null;
          case "wallet_requestPermissions": return [{ parentCapability: "eth_accounts" }];
          case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
          case "personal_sign": return rpc("personal_sign", [params[0], params[1]]);
          case "eth_signTypedData_v4": return rpc("eth_signTypedData_v4", params);
          case "eth_sendTransaction": {
            const tx = { ...params[0] };
            delete tx.gas;
            return rpc("eth_sendTransaction", [tx]);
          }
          default: return rpc(method, params);
        }
      },
      on(ev, f) { (listeners[ev] = listeners[ev] || []).push(f); return provider; },
      removeListener(ev, f) { listeners[ev] = (listeners[ev] || []).filter((x) => x !== f); return provider; },
    };
    window.ethereum = provider;
    const info = { uuid: "7f3c1e8a-trestle-test", name: "Trestle Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>", rdns: "dev.trestle.testwallet" };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  })();`;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/ui-e2e-${name}.png`, fullPage: false });
}

let failurePage: import("playwright").Page | null = null;

async function main() {
  const prisma = new PrismaClient();
  // a Trestle Denim product (seller paid on Local A) so paying from Local B is cross-chain
  const product = await prisma.product.findFirstOrThrow({
    where: {
      seller: { slug: "trestle-denim" },
      status: "ACTIVE",
      variants: { some: { stock: { gt: 1 } } },
    },
    include: { variants: { orderBy: { position: "asc" } } },
    orderBy: { priceUsdMicros: "asc" },
  });
  const variant = product.variants.find((v) => v.stock > 1)!;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(walletShim(BUYER, RPC, 31338));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 300)}`),
  );
  failurePage = page;
  const t0 = Date.now();
  const mark = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

  await page.goto(
    `${BASE}/products/${product.slug}?colour=${encodeURIComponent(variant.colour!)}`,
    { waitUntil: "networkidle" },
  );
  mark(`product page: ${product.title} (${variant.colour} / ${variant.size})`);
  await page
    .getByRole("radio", { name: new RegExp(`^Size ${variant.size}(,|$)`) })
    .first()
    .click();
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page.getByRole("dialog", { name: /Bag/ }).waitFor();
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
  await page.getByText("Stablecoin escrow").click();
  await page.getByRole("link", { name: "Pay with stablecoin" }).first().click();
  await page.waitForURL(/\/checkout\/crypto\?seller=/, { waitUntil: "commit" });
  mark("stablecoin checkout (signed out)");

  await page
    .getByRole("button", { name: /Connect wallet/i })
    .first()
    .click();
  // RainbowKit either lists wallets or (single injected provider) goes straight to the SIWE step
  const signBtn = page.getByRole("button", { name: /Sign message/i });
  const walletBtn = page
    .getByText("Trestle Test Wallet")
    .or(page.getByText("Browser Wallet"))
    .first();
  await signBtn.or(walletBtn).first().waitFor({ timeout: 30_000 });
  if (!(await signBtn.isVisible())) await walletBtn.click();
  mark("wallet connected; signing SIWE message");
  await signBtn.click({ timeout: 30_000 });
  await page.getByText("Shipping address").waitFor({ timeout: 30_000 });
  mark("signed in with SIWE");
  await shot(page, "1-shipping");

  await page.getByLabel("Full name").fill("Ava Chen");
  await page.getByLabel("Country (2-letter)").fill("AU");
  await page.getByLabel("Address", { exact: true }).fill("18 Harbour Street");
  await page.getByLabel("City").fill("Sydney");
  await page.getByLabel("Postal code").fill("2000");
  await page.getByRole("button", { name: /Continue to payment/i }).click();
  await page.getByText(/Pick any token on any supported chain/).waitFor();
  const ethB = page.locator(
    'input[name="route"][value^="31338:0x0000000000000000000000000000000000000000"]',
  );
  await ethB.waitFor({ timeout: 30_000 });
  await ethB.check();
  mark("selected route: ETH from Local B → seller on Local A");
  await shot(page, "2-routes");
  await page.getByRole("button", { name: /Review order/i }).click();
  await page.getByText(/Route security score/).waitFor();
  await shot(page, "3-review");
  await page.getByRole("button", { name: /Confirm & sign/i }).click();
  mark("confirm & sign clicked");
  await page.getByText("Your order is protected by escrow").waitFor({ timeout: 120_000 });
  mark("live tracker reached Escrowed (relayer fulfilled on Local A)");
  await shot(page, "4-escrowed");

  await page.getByRole("link", { name: /View order details/i }).click();
  await page.waitForURL(/\/orders\//);
  const orderId = page.url().split("/orders/")[1]!;
  await page.getByRole("button", { name: /Confirm delivery/i }).click({ timeout: 30_000 });
  await page.getByText("Funds released to seller").waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => document.body.innerText.includes("Completed"), null, {
    timeout: 60_000,
  });
  mark("gasless confirm delivery → order Completed");
  await shot(page, "5-completed");

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { paymentIntents: true },
  });
  const intent = order.paymentIntents.at(-1)!;
  console.log(
    JSON.stringify(
      {
        orderId,
        status: order.status,
        route: intent.routeKind,
        from: intent.sourceChainId,
        to: intent.destChainId,
        sourceTx: intent.sourceTxHash,
        fulfillTx: intent.fulfillTxHash,
        settleTx: intent.settleTxHash,
        buyerAccount: order.buyerAccount,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  await browser.close();
  if (order.status !== "COMPLETED" || !intent.settleTxHash)
    throw new Error("order did not complete");
  if (errors.length) console.warn("page errors:", errors);
  console.log("UI E2E PASSED");
}

main().catch(async (e) => {
  console.error("UI E2E FAILED:", e.message);
  if (failurePage) {
    await failurePage.screenshot({ path: `${OUT}/ui-e2e-failure.png` }).catch(() => undefined);
    const alerts = await failurePage
      .getByRole("alert")
      .allInnerTexts()
      .catch(() => []);
    if (alerts.length) console.error("alerts on page:", alerts);
    console.error("at", failurePage.url());
  }
  process.exit(1);
});
