import { beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { prisma } from "@trestle/db";
import { MemoryKV, __setKV } from "@/server/kv";
import { ORIGIN, call, newJar, req, resetDb, signIn, fixtureSeller } from "./helpers";
import { GET as nonceGET } from "@/app/api/auth/nonce/route";
import { POST as verifyPOST } from "@/app/api/auth/verify/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as productsGET, POST as productsPOST } from "@/app/api/products/route";
import { PATCH as productPATCH, DELETE as productDELETE } from "@/app/api/products/[id]/route";
import { GET as cartGET, POST as cartPOST } from "@/app/api/cart/route";
import { POST as quotePOST } from "@/app/api/checkout/quote/route";
import { POST as initiatePOST } from "@/app/api/checkout/initiate/route";
import { GET as orderGET } from "@/app/api/orders/[id]/route";
import { POST as reviewPOST } from "@/app/api/orders/[id]/review/route";
import { POST as fulfillmentPOST } from "@/app/api/orders/[id]/fulfillment/route";
import { GET as disputesGET } from "@/app/api/disputes/route";
import { POST as webhookPOST, signWebhook } from "@/app/api/webhooks/chain-events/route";
import { POST as onboardingPOST } from "@/app/api/seller/onboarding/route";

const post = (
  path: string,
  body: unknown,
  jar = newJar(),
  headers: Record<string, string> = { origin: ORIGIN },
) => req(path, { method: "POST", body, jar, headers });

beforeEach(async () => {
  await resetDb();
  __setKV(new MemoryKV()); // fresh rate-limit / nonce / cart store per test
});

describe("SIWE authentication", () => {
  it("issues a session for a valid signature and resolves it", async () => {
    const { jar, user } = await signIn();
    expect(jar.cookies.get("trestle_session")).toBeTruthy();
    const s = await call(sessionGET, req("/api/auth/session", { jar }));
    expect(s.data.user.id).toBe(user.id);
    expect(s.data.user.role).toBe("BUYER");
  });

  it("rejects nonce replay", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const jar = newJar();
    const n = await call(nonceGET, req("/api/auth/nonce", { jar }), undefined, jar);
    const message = createSiweMessage({
      address: account.address,
      chainId: 31338,
      domain: "localhost:3000",
      nonce: n.data.nonce,
      uri: ORIGIN,
      version: "1",
      issuedAt: new Date(),
    });
    const signature = await account.signMessage({ message });
    const first = await call(
      verifyPOST,
      post("/api/auth/verify", { message, signature }, jar),
      undefined,
      jar,
    );
    expect(first.status).toBe(200);
    // attacker replays the exact same signed message (with the bind cookie re-attached)
    const replayJar = newJar();
    replayJar.cookies.set("trestle_siwe", "anything");
    const second = await call(
      verifyPOST,
      post("/api/auth/verify", { message, signature }, replayJar),
    );
    expect(second.status).toBe(401);
    expect(second.data.error.code).toBe("siwe_invalid");
  });

  it("rejects a message for another domain and a forged signature", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    for (const [domain, signer] of [
      ["evil.example", account],
      ["localhost:3000", other],
    ] as const) {
      const jar = newJar();
      const n = await call(nonceGET, req("/api/auth/nonce", { jar }), undefined, jar);
      const message = createSiweMessage({
        address: account.address,
        chainId: 31338,
        domain,
        nonce: n.data.nonce,
        uri: `http://${domain}`,
        version: "1",
        issuedAt: new Date(),
      });
      const signature = await signer.signMessage({ message });
      const res = await call(verifyPOST, post("/api/auth/verify", { message, signature }, jar));
      expect(res.status).toBe(401);
    }
  });

  it("rejects unsupported chains", async () => {
    await expect(signIn(generatePrivateKey(), { chainId: 1 })).rejects.toThrow(/not supported/);
  });

  it("logout revokes the session server-side", async () => {
    const { jar } = await signIn();
    const token = jar.cookies.get("trestle_session")!;
    await call(logoutPOST, post("/api/auth/logout", {}, jar), undefined, jar);
    const stolen = newJar();
    stolen.cookies.set("trestle_session", token);
    const s = await call(sessionGET, req("/api/auth/session", { jar: stolen }));
    expect(s.data.user).toBeNull();
  });
});

describe("authorization, validation, CSRF and rate limits", () => {
  const validProduct = {
    title: "Test Linen Shirt",
    description: "A very nice test shirt for the test suite.",
    price: "49.99",
    department: "women",
    category: "t-shirts",
    images: [{ url: "/images/catalog/t-shirts-woman-t-shirt_03_1.webp", alt: "Test shirt in white", colour: "White" }],
    chainListingOptions: [31337, 31338],
    variants: [
      { sku: "SHIRT-TEST-WH-S", colour: "White", colourHex: "#f5f3ee", size: "S", stock: 5 },
      { sku: "SHIRT-TEST-WH-M", colour: "White", colourHex: "#f5f3ee", size: "M", stock: 0 },
    ],
  };

  it("requires a session and a seller role to create products", async () => {
    const anon = await call(productsPOST, post("/api/products", validProduct));
    expect(anon.status).toBe(401);
    const { jar } = await signIn();
    const buyer = await call(productsPOST, post("/api/products", validProduct, jar));
    expect(buyer.status).toBe(403);
  });

  it("lets an onboarded seller create, update and delete products with exact prices", async () => {
    const { jar } = await signIn();
    const onboard = await call(
      onboardingPOST,
      post(
        "/api/seller/onboarding",
        {
          storefrontName: "Lamp Co",
          slug: "lamp-co",
          payoutChainId: 31338,
          payoutToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        },
        jar,
      ),
    );
    expect(onboard.status).toBe(200);
    const created = await call(productsPOST, post("/api/products", validProduct, jar));
    expect(created.status).toBe(200);
    expect(created.data.product.priceUsdMicros).toBe("49990000");
    const id = created.data.product.id;
    const patched = await call(
      productPATCH,
      req(`/api/products/${id}`, {
        method: "PATCH",
        jar,
        headers: { origin: ORIGIN },
        body: { ...validProduct, price: "59.00" },
      }),
      { id },
    );
    expect(patched.status).toBe(200);
    expect(patched.data.product.priceUsdMicros).toBe("59000000");
    const del = await call(
      productDELETE,
      req(`/api/products/${id}`, { method: "DELETE", jar, headers: { origin: ORIGIN } }),
      { id },
    );
    expect(del.data.deleted).toBe(true);
  });

  it("forbids editing another seller's product", async () => {
    const { product } = await fixtureSeller();
    const { jar } = await signIn();
    await call(
      onboardingPOST,
      post(
        "/api/seller/onboarding",
        {
          storefrontName: "Intruder",
          slug: "intruder",
          payoutChainId: 31338,
          payoutToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        },
        jar,
      ),
    );
    const res = await call(
      productPATCH,
      req(`/api/products/${product.id}`, {
        method: "PATCH",
        jar,
        headers: { origin: ORIGIN },
        body: validProduct,
      }),
      { id: product.id },
    );
    expect(res.status).toBe(403);
  });

  it("returns field errors for invalid input", async () => {
    const { jar } = await signIn();
    await call(
      onboardingPOST,
      post(
        "/api/seller/onboarding",
        {
          storefrontName: "Val",
          slug: "val-co",
          payoutChainId: 31338,
          payoutToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        },
        jar,
      ),
    );
    const res = await call(
      productsPOST,
      post("/api/products", { ...validProduct, price: "12.345", images: ["http://insecure"] }, jar),
    );
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe("validation_error");
    expect(Object.keys(res.data.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(["price", "images"]),
    );
  });

  it("rejects cross-origin mutations", async () => {
    const { jar } = await signIn();
    const res = await call(
      cartPOST,
      post("/api/cart", { op: "clear" }, jar, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(res.data.error.code).toBe("bad_origin");
  });

  it("rate limits bursts", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await call(
        verifyPOST,
        post("/api/auth/verify", { message: "x".repeat(60), signature: "0x00" }),
      );
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
  });

  it("admin-only endpoints reject buyers", async () => {
    const { jar } = await signIn();
    const res = await call(disputesGET, req("/api/disputes", { jar }));
    expect(res.status).toBe(403);
  });
});

describe("catalog & cart", () => {
  it("filters products by search, category, price and chain", async () => {
    await fixtureSeller();
    const r1 = await call(
      productsGET,
      req("/api/products?q=tee&category=t-shirts&department=women&colour=Black&size=M&maxPrice=200&chain=31337"),
    );
    expect(r1.data.total).toBe(1);
    const r2 = await call(productsGET, req("/api/products?minPrice=200"));
    expect(r2.data.total).toBe(0);
  });

  it("adds, updates and clamps cart lines to stock", async () => {
    const { product } = await fixtureSeller({ stock: 2 });
    const { jar } = await signIn();
    const v = product.variants[0]!.id;
    await call(cartPOST, post("/api/cart", { op: "add", variantId: v, quantity: 1 }, jar));
    const added = await call(
      cartPOST,
      post("/api/cart", { op: "add", variantId: v, quantity: 5 }, jar),
    );
    expect(added.data.lines[0].quantity).toBe(2); // clamped to stock
    expect(added.data.warnings.length).toBeGreaterThan(0);
    const cart = await call(cartGET, req("/api/cart", { jar }));
    expect(cart.data.subtotalUsdMicros).toBe("250000000");
    const removed = await call(cartPOST, post("/api/cart", { op: "remove", variantId: v }, jar));
    expect(removed.data.lines).toHaveLength(0);
  });
});

describe("checkout", () => {
  const shipping = {
    name: "Test Buyer",
    line1: "1 Test St",
    city: "Testville",
    postalCode: "12345",
    country: "us",
  };

  it("quotes exact amounts, reserves stock atomically and is idempotent per quote", async () => {
    const { seller, product } = await fixtureSeller({ stock: 1 });
    const v = product.variants[0]!.id;
    const { jar } = await signIn();
    const q = await call(
      quotePOST,
      post(
        "/api/checkout/quote",
        { sellerId: seller.id, items: [{ variantId: v, quantity: 1 }] },
        jar,
      ),
    );
    expect(q.status).toBe(200);
    expect(q.data.subtotalUsdMicros).toBe("125000000");
    const direct = q.data.routes.find(
      (r: any) => r.kind === "direct" && r.payToken.symbol === "tUSDC",
    );
    expect(direct.destAmount).toBe("125000000");
    expect(BigInt(direct.sourceAmount)).toBe(125_000_000n + BigInt(direct.feeAmount));

    const init = await call(
      initiatePOST,
      post(
        "/api/checkout/initiate",
        {
          quoteId: q.data.quoteId,
          routeKey: direct.key,
          buyerAccountMode: "wallet",
          shippingAddress: shipping,
        },
        jar,
      ),
    );
    expect(init.status).toBe(200);
    expect(init.data.calls.map((c: any) => c.description)).toEqual([
      "Approve Trestle router to move your tokens",
      "Pay into escrow",
    ]);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v } })).stock).toBe(0);

    // retrying the same quote returns the same order and does not double-reserve
    const again = await call(
      initiatePOST,
      post(
        "/api/checkout/initiate",
        {
          quoteId: q.data.quoteId,
          routeKey: direct.key,
          buyerAccountMode: "wallet",
          shippingAddress: shipping,
        },
        jar,
      ),
    );
    expect(again.data.orderId).toBe(init.data.orderId);
    expect(again.data.idempotentReplay).toBe(true);
    expect(await prisma.order.count()).toBe(1);

    // a second buyer cannot oversell the last unit
    const other = await signIn();
    const q2 = await call(
      quotePOST,
      post(
        "/api/checkout/quote",
        { sellerId: seller.id, items: [{ variantId: v, quantity: 1 }] },
        other.jar,
      ),
    );
    expect(q2.status).toBe(409);
  });

  it("prevents concurrent oversell of the last unit", async () => {
    const { seller, product } = await fixtureSeller({ stock: 1 });
    const v = product.variants[0]!.id;
    const a = await signIn();
    const b = await signIn();
    const qa = await call(
      quotePOST,
      post(
        "/api/checkout/quote",
        { sellerId: seller.id, items: [{ variantId: v, quantity: 1 }] },
        a.jar,
      ),
    );
    const qb = await call(
      quotePOST,
      post(
        "/api/checkout/quote",
        { sellerId: seller.id, items: [{ variantId: v, quantity: 1 }] },
        b.jar,
      ),
    );
    const key = (q: any) => q.data.routes.find((r: any) => r.kind === "direct" && r.available).key;
    const [ra, rb] = await Promise.all([
      call(
        initiatePOST,
        post(
          "/api/checkout/initiate",
          {
            quoteId: qa.data.quoteId,
            routeKey: key(qa),
            buyerAccountMode: "wallet",
            shippingAddress: shipping,
          },
          a.jar,
        ),
      ),
      call(
        initiatePOST,
        post(
          "/api/checkout/initiate",
          {
            quoteId: qb.data.quoteId,
            routeKey: key(qb),
            buyerAccountMode: "wallet",
            shippingAddress: shipping,
          },
          b.jar,
        ),
      ),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v } })).stock).toBe(0);
  });

  it("rejects quotes owned by another user", async () => {
    const { seller, product } = await fixtureSeller();
    const a = await signIn();
    const b = await signIn();
    const q = await call(
      quotePOST,
      post(
        "/api/checkout/quote",
        { sellerId: seller.id, items: [{ variantId: product.variants[0]!.id, quantity: 1 }] },
        a.jar,
      ),
    );
    const key = q.data.routes.find((r: any) => r.available).key;
    const res = await call(
      initiatePOST,
      post(
        "/api/checkout/initiate",
        {
          quoteId: q.data.quoteId,
          routeKey: key,
          buyerAccountMode: "wallet",
          shippingAddress: shipping,
        },
        b.jar,
      ),
    );
    expect(res.status).toBe(403);
  });
});

describe("orders", () => {
  it("hides orders from non-participants and enforces review/fulfilment rules", async () => {
    const { seller, product, pk: sellerPk } = await fixtureSeller();
    const buyer = await signIn();
    const order = await prisma.order.create({
      data: {
        id: "ord_test_1",
        buyerId: buyer.user.id,
        sellerId: seller.id,
        status: "ESCROWED",
        subtotalUsdMicros: 125_000_000n,
        payoutChainId: 31338,
        payoutToken: seller.payoutToken,
        payoutAmount: "125000000",
        onchainRef: "0x" + "ab".repeat(32),
        items: {
          create: {
            productId: product.id,
            productVariantId: product.variants[0]!.id,
            titleSnapshot: "Fixture Watch",
            variantSnapshot: "Black",
            quantity: 1,
            unitPriceUsdMicros: 125_000_000n,
          },
        },
      },
    });
    const stranger = await signIn();
    const hidden = await call(orderGET, req(`/api/orders/${order.id}`, { jar: stranger.jar }), {
      id: order.id,
    });
    expect(hidden.status).toBe(404);
    const own = await call(orderGET, req(`/api/orders/${order.id}`, { jar: buyer.jar }), {
      id: order.id,
    });
    expect(own.status).toBe(200);
    expect(own.data.viewer).toBe("buyer");

    const early = await call(
      reviewPOST,
      post(
        `/api/orders/${order.id}/review`,
        { rating: 5, text: "Great product, fast!" },
        buyer.jar,
      ),
      { id: order.id },
    );
    expect(early.status).toBe(409);

    const sellerSession = await signIn(sellerPk);
    const noTracking = await call(
      fulfillmentPOST,
      post(`/api/orders/${order.id}/fulfillment`, { action: "ship" }, sellerSession.jar),
      { id: order.id },
    );
    expect(noTracking.status).toBe(400);
    const shipped = await call(
      fulfillmentPOST,
      post(
        `/api/orders/${order.id}/fulfillment`,
        { action: "ship", trackingNumber: "1Z999" },
        sellerSession.jar,
      ),
      { id: order.id },
    );
    expect(shipped.status).toBe(200);
    const buyerShip = await call(
      fulfillmentPOST,
      post(`/api/orders/${order.id}/fulfillment`, { action: "deliver" }, buyer.jar),
      { id: order.id },
    );
    expect(buyerShip.status).toBe(403);

    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    const ok = await call(
      reviewPOST,
      post(
        `/api/orders/${order.id}/review`,
        { rating: 5, text: "Great product, fast!" },
        buyer.jar,
      ),
      { id: order.id },
    );
    expect(ok.status).toBe(200);
    expect(ok.data.review.verifiedPurchase).toBe(true);
    const dup = await call(
      reviewPOST,
      post(`/api/orders/${order.id}/review`, { rating: 1, text: "Changing my mind." }, buyer.jar),
      { id: order.id },
    );
    expect(dup.status).toBe(409);
  });
});

describe("chain-events webhook", () => {
  const secret = "test-webhook-secret-0123456789abcdef0123456789";
  const event = {
    chainId: 31338,
    contract: "paymaster",
    address: "0x" + "11".repeat(20),
    eventName: "GasSponsored",
    txHash: "0x" + "22".repeat(32),
    logIndex: 3,
    blockNumber: "12",
    blockTime: new Date().toISOString(),
    args: { sender: "0x" + "33".repeat(20), day: "1", actualGasCost: "1000", opSucceeded: true },
  };
  const send = (body: string, ts: string, sig: string) =>
    call(
      webhookPOST,
      req("/api/webhooks/chain-events", {
        method: "POST",
        rawBody: body,
        headers: {
          "content-type": "application/json",
          "x-trestle-timestamp": ts,
          "x-trestle-signature": sig,
        },
      }),
    );

  it("verifies HMAC, rejects stale timestamps and applies events exactly once", async () => {
    const body = JSON.stringify({ events: [event] });
    const ts = String(Math.floor(Date.now() / 1000));
    expect((await send(body, ts, "00".repeat(32))).status).toBe(401);
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    expect((await send(body, stale, signWebhook(secret, stale, body))).status).toBe(401);
    const ok = await send(body, ts, signWebhook(secret, ts, body));
    expect(ok.status).toBe(200);
    expect(ok.data.applied).toBe(1);
    const dup = await send(body, ts, signWebhook(secret, ts, body));
    expect(dup.data.duplicates).toBe(1);
    expect(await prisma.chainEvent.count()).toBe(1);
  });
});
