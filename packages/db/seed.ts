/**
 * Trestle seed — idempotent and non-destructive by default.
 *
 *   pnpm seed                  # catalogue (+ local demo users/orders when the database is local)
 *   pnpm seed -- --catalog     # catalogue only: chains, sellers, collections, products, images, variants
 *   pnpm seed -- --demo        # also demo users/orders on a NON-local database (never do this in production)
 *   pnpm seed -- --reset       # LOCAL DATABASES ONLY: wipe Trestle tables first (refused for any remote host)
 *
 * Idempotency: every catalogue row is keyed (seller slug, product slug, variant SKU, collection slug) and
 * only CREATED when missing — existing rows (e.g. edited in the admin) are never overwritten, stock is never
 * reset, and nothing is deleted without --reset. Demo orders are only created when the database has no orders.
 *
 * Local mode with both Anvil chains running and contracts deployed ("on-chain seed"): every demo order is
 * REAL — paid into escrow on the local chains, then confirmed, disputed or resolved on-chain; the resulting
 * events are ingested through the same idempotent sync the relayer uses. Otherwise demo orders are written
 * with isSeedDemo=true and NO transaction hashes, and the UI labels them as seeded demo records.
 *
 * No reviews are seeded: product ratings only ever come from real completed orders.
 */
import { randomBytes } from "node:crypto";
import { zeroAddress, type Address, type Hex } from "viem";
import type { OrderStatus, Prisma } from "@prisma/client";
import {
  computeRoute,
  findTokenBySymbol,
  getChainProfiles,
  getDeployment,
  getTokens,
  isDeployed,
  orderRefFor,
  parseNetworkMode,
  parseUsdToMicros,
  priceTable,
  usdMicrosToStableAmount,
  type ChainProfile,
  type RouteQuote,
} from "@trestle/shared";
import { trestleLoyaltyAbi } from "@trestle/shared/abis";
import { prisma } from "./src/client";
import { hashPassword } from "./src/password";
import { applyChainEvents, fetchTrestleEvents } from "./src/sync";
import {
  COLLECTIONS,
  COLOURS,
  SELLERS,
  chartFor,
  imageCredit,
  imageUrl,
  skuFor,
  variantsFor,
  type SeedSeller,
} from "./seed/catalog";
import { ANVIL_KEYS, ChainActor, anvilAddress, rpcReachable, type AnvilRole } from "./seed/onchain";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** True only for databases on this machine / the local docker network. */
function isLocalDatabase(url = process.env.DATABASE_URL ?? ""): boolean {
  try {
    const host = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"].includes(host);
  } catch {
    return false;
  }
}

const mode = parseNetworkMode(opt("network") ?? process.env.NETWORK_MODE);
const localDb = isLocalDatabase();
const reset = flag("reset");
if (reset && !localDb) {
  console.error(
    "Refusing --reset: DATABASE_URL does not point at a local database. Trestle never wipes remote data.",
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && flag("demo")) {
  console.error("Refusing --demo with NODE_ENV=production: demo users/orders are for local/preview only.");
  process.exit(1);
}
const catalogOnly = flag("catalog");
const withDemo = !catalogOnly && (flag("demo") || (localDb && mode === "local"));
const profiles = getChainProfiles(mode, {

  chainARpcUrl: mode === "local" ? process.env.CHAIN_A_RPC_URL : process.env.SEPOLIA_RPC_URL,
  chainBRpcUrl: mode === "local" ? process.env.CHAIN_B_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL,
});
const [A, B] = profiles;
const prices = priceTable(process.env.PRICE_ETH_USD);
const FEE_BPS = BigInt(process.env.PROTOCOL_FEE_BPS ?? "100");
const DELIVERY_WINDOW = 14n * 24n * 3600n;

const newId = (prefix: string) => `${prefix}_${randomBytes(10).toString("hex")}`;
const lc = (a: string) => a.toLowerCase();

function placeholderAddress(label: string): Address {
  // deterministic, key-less demo address (nobody can sign as it)
  const h = Buffer.from(label.padEnd(20, "_").slice(0, 20)).toString("hex");
  return `0x${h}` as Address;
}

type BuyerKey = "ava" | "noah";
interface Scenario {
  key: string;
  buyer: BuyerKey;
  product: string;
  /** "Colour/Size" */
  variant: string;
  qty: number;
  target: OrderStatus;
  dispute?: { reason: string; resolveBps?: number; notes?: string };
  tracking?: string;
  crossChainPending?: boolean;
}

/** Demo crypto-escrow orders (local/preview only). No reviews are ever seeded. */
const SCENARIOS: Scenario[] = [
  {
    key: "s1",
    buyer: "ava",
    product: "floral-maxi-dress",
    variant: "Cream floral/S",
    qty: 1,
    target: "COMPLETED",
    tracking: "1Z999AA10123456784",
  },
  {
    key: "s2",
    buyer: "noah",
    product: "mens-straight-jeans",
    variant: "Light wash/32",
    qty: 1,
    target: "COMPLETED",
    tracking: "9400111899223197428490",
  },
  { key: "s3", buyer: "ava", product: "wide-leg-jeans", variant: "Washed black/27", qty: 1, target: "ESCROWED" },
  {
    key: "s4",
    buyer: "noah",
    product: "mens-heavyweight-tee",
    variant: "Butter/L",
    qty: 1,
    target: "SHIPPED",
    tracking: "1Z999AA10123456785",
  },
  {
    key: "s5",
    buyer: "ava",
    product: "v-neck-maxi-dress",
    variant: "Ivory/M",
    qty: 1,
    target: "DISPUTED",
    tracking: "9400111899223197428491",
    dispute: { reason: "The side seam arrived split about 5 cm below the waist. Photos shared in chat." },
  },
  {
    key: "s6",
    buyer: "noah",
    product: "watch-cap",
    variant: "Black/One size",
    qty: 1,
    target: "REFUNDED",
    dispute: {
      reason: "Parcel never arrived; carrier shows it was returned to sender.",
      resolveBps: 10_000,
      notes: "Carrier confirmed return to sender. Full refund to buyer.",
    },
  },
  {
    key: "s7",
    buyer: "noah",
    product: "mens-oversized-tee",
    variant: "Mint/M",
    qty: 1,
    target: "DELIVERED",
    tracking: "1Z999AA10123456786",
  },
  {
    key: "s8",
    buyer: "ava",
    product: "womens-relaxed-crew-tee",
    variant: "Black/S",
    qty: 2,
    target: "PENDING_PAYMENT",
  },
  {
    key: "s9",
    buyer: "noah",
    product: "mens-gradient-print-tee",
    variant: "Sunset fade/L",
    qty: 1,
    target: "COMPLETED",
  },
  {
    key: "s10",
    buyer: "ava",
    product: "botanical-print-tee",
    variant: "Gerbera/S",
    qty: 2,
    target: "COMPLETED",
    dispute: {
      reason: "One of the two tees arrived with a smudged print.",
      resolveBps: 3_000,
      notes: "Print defect verified from photos: 30% refunded to buyer, 70% released to seller.",
    },
  },
  {
    key: "s11",
    buyer: "noah",
    product: "slouchy-rib-beanie",
    variant: "Oat/One size",
    qty: 1,
    target: "PENDING_PAYMENT",
    crossChainPending: true,
  },
];

async function wipe() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.returnRequest.deleteMany(),
    prisma.review.deleteMany(),
    prisma.dispute.deleteMany(),
    prisma.paymentIntent.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cardPayment.deleteMany(),
    prisma.stripeEvent.deleteMany(),
    prisma.wishlistItem.deleteMany(),
    prisma.collectionProduct.deleteMany(),
    prisma.collection.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.authenticityCertificate.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.seller.deleteMany(),
    prisma.reputationEvent.deleteMany(),
    prisma.loyaltyTransaction.deleteMany(),
    prisma.smartAccount.deleteMany(),
    prisma.user.deleteMany(),
    prisma.promoCode.deleteMany(),
    prisma.contactMessage.deleteMany(),
    prisma.chainEvent.deleteMany(),
    prisma.relayerCheckpoint.deleteMany(),
    prisma.supportedChain.deleteMany(),
  ]);
}

type SellerRow = {
  id: string;
  address: Address;
  payoutChain: ChainProfile;
  payoutToken: Address;
  symbol: string;
};
type ProductRow = {
  id: string;
  sellerKey: SeedSeller["key"];
  priceMicros: bigint;
  title: string;
  image: string;
  variants: { id: string; name: string; key: string }[];
};

async function upsertUserByWallet(address: string | null, data: { displayName: string; role: "ADMIN" | "BUYER" | "SELLER" }) {
  if (!address) return prisma.user.create({ data: { ...data, walletAddress: null } });
  return prisma.user.upsert({
    where: { walletAddress: lc(address) },
    create: { walletAddress: lc(address), ...data },
    update: {},
  });
}

/** Chains, sellers, collections, products, images and variants — created only when missing. */
async function seedCatalog() {
  for (const p of profiles) {
    const data = {
      name: p.label,
      rpcUrl: p.rpcUrl,
      nativeToken: p.chain.nativeCurrency.symbol,
      isTestnetDemo: p.isTestnetDemo,
      networkMode: mode,
      role: p.role,
      explorerUrl: p.explorerUrl ?? null,
    };
    await prisma.supportedChain.upsert({
      where: { chainId: p.chain.id },
      create: { chainId: p.chain.id, ...data },
      update: {},
    });
  }

  const sellerAddress = (key: SeedSeller["key"], idx: number): Address | null => {
    if (mode === "local") return anvilAddress(key);
    const list =
      process.env.SEED_SELLER_ADDRESSES?.split(",")
        .map((x) => x.trim())
        .filter(Boolean) ?? [];
    return (list[idx] as Address | undefined) ?? null;
  };

  const sellerRows = {} as Record<SeedSeller["key"], SellerRow>;
  const productRows = new Map<string, ProductRow>();
  let createdProducts = 0;
  const now = Date.now();

  for (const [i, s] of SELLERS.entries()) {
    const payoutProfile = s.payoutChain === "A" ? A : B;
    const token = findTokenBySymbol(mode, payoutProfile.chain.id, s.payoutSymbol);
    const payoutToken = (token?.address ?? zeroAddress) as Address;
    let seller = await prisma.seller.findUnique({ where: { slug: s.slug } });
    const address = sellerAddress(s.key, i);
    if (!seller) {
      const user = await upsertUserByWallet(address, { displayName: s.storefrontName, role: "SELLER" });
      seller = await prisma.seller.create({
        data: {
          userId: user.id,
          storefrontName: s.storefrontName,
          slug: s.slug,
          bio: s.bio,
          payoutChainId: payoutProfile.chain.id,
          payoutToken: lc(payoutToken),
          payoutAddress: lc(address ?? zeroAddress),
          verified: s.verified,
          verifiedAt: s.verified ? new Date() : null,
        },
      });
    }
    sellerRows[s.key] = {
      id: seller.id,
      address: (seller.payoutAddress as Address) ?? zeroAddress,
      payoutChain: profiles.find((x) => x.chain.id === seller!.payoutChainId) ?? payoutProfile,
      payoutToken: seller.payoutToken as Address,
      symbol: s.payoutSymbol,
    };

    for (const p of s.products) {
      let product = await prisma.product.findUnique({
        where: { slug: p.key },
        include: { variants: true, gallery: true },
      });
      if (!product) {
        const gallery = p.colours.flatMap(([colour, refs]) => refs.map((ref) => ({ colour, ref })));
        product = await prisma.product.create({
          data: {
            sellerId: seller.id,
            slug: p.key,
            title: p.title,
            description: p.description,
            images: gallery.map((g) => imageUrl(g.ref)),
            priceUsdMicros: parseUsdToMicros(p.price),
            category: p.category,
            department: p.department,
            subcategory: p.subcategory,
            material: p.material,
            fit: p.fit,
            care: p.care,
            sizeChartKey: chartFor(p.sizes),
            publishedAt: new Date(now - p.publishedDaysAgo * 86_400_000),
            chainListingOptions: profiles.map((x) => x.chain.id),
            featured: p.featured ?? false,
            manufacturer: s.storefrontName,
            status: "ACTIVE",
            gallery: {
              create: gallery.map((g, position) => {
                const c = imageCredit(g.ref);
                return {
                  url: imageUrl(g.ref),
                  alt: `${p.title} in ${g.colour.toLowerCase()}`,
                  colour: g.colour,
                  position,
                  width: c.width,
                  height: c.height,
                  credit: c.credit,
                  license: c.license,
                  sourceUrl: c.sourceUrl,
                };
              }),
            },
          },
          include: { variants: true, gallery: true },
        });
        createdProducts++;
      }
      // variants: create any SKU that is missing; never touch stock of existing SKUs
      const existing = new Set(product.variants.map((v) => v.sku));
      const missing = variantsFor(p).filter((v) => !existing.has(skuFor(p, v.colour, v.size)));
      if (missing.length) {
        await prisma.productVariant.createMany({
          data: missing.map((v) => ({
            productId: product!.id,
            name: `${v.colour} / ${v.size}`,
            attributes: { colour: v.colour, size: v.size },
            colour: v.colour,
            colourHex: COLOURS[v.colour] ?? null,
            size: v.size,
            position: v.position,
            stock: v.stock,
            sku: skuFor(p, v.colour, v.size),
          })),
          skipDuplicates: true,
        });
      }
      const variants = await prisma.productVariant.findMany({ where: { productId: product.id } });
      productRows.set(p.key, {
        id: product.id,
        sellerKey: s.key,
        priceMicros: product.priceUsdMicros,
        title: product.title,
        image: product.images[0] ?? "",
        variants: variants.map((v) => ({ id: v.id, name: v.name, key: `${v.colour}/${v.size}` })),
      });
    }
  }

  for (const col of COLLECTIONS) {
    const row = await prisma.collection.upsert({
      where: { slug: col.slug },
      create: {
        slug: col.slug,
        title: col.title,
        description: col.description,
        image: imageUrl(col.image),
        position: col.position,
      },
      update: {},
    });
    const members = SELLERS.flatMap((s) => s.products)
      .filter((p) => p.collections.includes(col.slug))
      .map((p, position) => ({ collectionId: row.id, productId: productRows.get(p.key)!.id, position }));
    await prisma.collectionProduct.createMany({ data: members, skipDuplicates: true });
  }

  if (process.env.SEED_PROMO_WELCOME === "1" || (localDb && mode === "local")) {
    // demo promo code for local testing of the discount path (documented as demo in the handoff)
    await prisma.promoCode.upsert({
      where: { code: "WELCOME10" },
      create: {
        code: "WELCOME10",
        description: "Demo: 10% off orders over $100 (local/preview only)",
        percentOff: 10,
        minSubtotalCents: 10_000,
      },
      update: {},
    });
  }

  console.log(
    `Catalogue: ${SELLERS.length} sellers, ${productRows.size} products (${createdProducts} newly created), ${COLLECTIONS.length} collections`,
  );
  return { sellerRows, productRows };
}

async function main() {
  if (reset) {
    console.log("--reset on a local database: wiping Trestle tables");
    await wipe();
  }
  console.log(
    `Seeding Trestle (${mode}; ${localDb ? "local" : "remote"} database; demo data ${withDemo ? "ON" : "OFF"})`,
  );
  const { sellerRows, productRows } = await seedCatalog();
  if (!withDemo) {
    console.log("Skipping demo users and orders (catalogue-only seed).");
    return;
  }
  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    console.log(`Database already has ${existingOrders} orders — leaving demo orders untouched.`);
    return;
  }

  const deployed = isDeployed(mode);
  const onchainRequested = !flag("no-onchain") && mode === "local";
  const onchain =
    onchainRequested && deployed && (await rpcReachable(A)) && (await rpcReachable(B));
  console.log(
    `Demo orders: ${onchain ? "ON-CHAIN (real transactions on local Anvil chains)" : "demo records only (no chain writes)"}`,
  );

  // ---------------------------------------------------------------- demo users
  const addr = (role: AnvilRole, envList: string | undefined, idx: number, label: string): Address => {
    if (mode === "local") return anvilAddress(role);
    const list =
      envList
        ?.split(",")
        .map((x) => x.trim())
        .filter(Boolean) ?? [];
    return (list[idx] as Address | undefined) ?? placeholderAddress(label);
  };
  const adminAddress =
    mode === "local"
      ? anvilAddress("deployer")
      : ((process.env.SEED_ADMIN_ADDRESS as Address | undefined) ??
        getDeployment(mode, B.chain.id)?.arbiter ??
        placeholderAddress("admin"));
  const admin = await upsertUserByWallet(adminAddress, { displayName: "Trestle Admin", role: "ADMIN" });
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "trestle-demo-password";
  await prisma.user.update({
    where: { id: admin.id },
    data: { role: "ADMIN", email: "admin@trestle.local", passwordHash: await hashPassword(demoPassword) },
  });
  const buyers: Record<BuyerKey, { id: string; address: Address }> = {} as never;
  for (const [i, [key, name]] of (
    [
      ["ava", "Ava Chen"],
      ["noah", "Noah Patel"],
    ] as const
  ).entries()) {
    const address = addr(key, process.env.SEED_BUYER_ADDRESSES, i, `buyer-${key}`);
    const u = await upsertUserByWallet(address, { displayName: name, role: "BUYER" });
    await prisma.user.update({
      where: { id: u.id },
      data: { email: `${key}@trestle.local`, passwordHash: await hashPassword(demoPassword) },
    });
    buyers[key] = { id: u.id, address };
  }

  // ---------------------------------------------------------------- orders
  const actors = onchain
    ? {
        [A.chain.id]: new ChainActor(A, getDeployment(mode, A.chain.id)!),
        [B.chain.id]: new ChainActor(B, getDeployment(mode, B.chain.id)!),
      }
    : undefined;
  const startBlocks = new Map<number, bigint>();
  if (actors)
    for (const [id, a] of Object.entries(actors))
      startBlocks.set(Number(id), await a.public.getBlockNumber());

  const created: {
    scenario: Scenario;
    orderId: string;
    ref: Hex;
    sellerKey: SeedSeller["key"];
    productId: string;
  }[] = [];

  for (const sc of SCENARIOS) {
    const prod = productRows.get(sc.product)!;
    const seller = sellerRows[prod.sellerKey];
    const variant = prod.variants.find((v) => v.key === sc.variant);
    if (!variant) throw new Error(`scenario ${sc.key}: no variant ${sc.variant} on ${sc.product}`);
    const subtotal = prod.priceMicros * BigInt(sc.qty);
    const payoutToken = getTokens(mode, seller.payoutChain.chain.id).find(
      (t) => t.address.toLowerCase() === seller.payoutToken.toLowerCase(),
    );
    const payoutAmount = payoutToken ? usdMicrosToStableAmount(subtotal, payoutToken) : subtotal;
    const orderId = newId("ord");
    const ref = orderRefFor(orderId);
    const buyer = buyers[sc.buyer];

    // route: seeded orders pay directly on the payout chain; s11 is a live cross-chain intent from the other chain
    const sourceProfile = sc.crossChainPending
      ? seller.payoutChain.role === "A"
        ? B
        : A
      : seller.payoutChain;
    const payToken = sc.crossChainPending
      ? getTokens(mode, sourceProfile.chain.id).find((t) => t.isNative)
      : payoutToken;
    const quote =
      payToken && payoutToken
        ? (computeRoute({
            subtotalUsdMicros: subtotal,
            payToken,
            payoutToken,
            sourceProfile,
            destProfile: seller.payoutChain,
            prices,
            effectiveFeeBps: FEE_BPS,
            solverSpreadBps: 10n,
          }) as RouteQuote)
        : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: orderId,
          buyerId: buyer.id,
          sellerId: seller.id,
          status: onchain ? "PENDING_PAYMENT" : sc.target,
          subtotalUsdMicros: subtotal,
          payoutChainId: seller.payoutChain.chain.id,
          payoutToken: lc(seller.payoutToken),
          payoutAmount: payoutAmount.toString(),
          onchainRef: ref.toLowerCase(),
          buyerAccount: lc(buyer.address),
          isSeedDemo: !onchain,
          reservationExpiresAt:
            sc.target === "PENDING_PAYMENT" ? new Date(Date.now() + 2 * 24 * 3600_000) : null,
          shippingAddress: {
            name: sc.buyer === "ava" ? "Ava Chen" : "Noah Patel",
            line1: sc.buyer === "ava" ? "18 Harbour Street" : "221 Market Lane",
            city: sc.buyer === "ava" ? "Sydney" : "Austin",
            postalCode: sc.buyer === "ava" ? "2000" : "78701",
            country: sc.buyer === "ava" ? "AU" : "US",
          },
          items: {
            create: {
              productId: prod.id,
              productVariantId: variant.id,
              titleSnapshot: prod.title,
              variantSnapshot: variant.name,
              imageSnapshot: prod.image,
              quantity: sc.qty,
              unitPriceUsdMicros: prod.priceMicros,
            },
          },
        },
      });
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stock: { decrement: sc.qty } },
      });
      if (quote) {
        await tx.paymentIntent.create({
          data: {
            orderId,
            routeKind: quote.kind === "direct" ? "DIRECT" : "CROSS_CHAIN",
            routeId: quote.routeId,
            payer: lc(buyer.address),
            sourceChainId: quote.sourceChainId,
            sourceToken: lc(quote.payToken.address),
            sourceAmount: quote.sourceAmount.toString(),
            feeAmount: quote.feeAmount.toString(),
            destChainId: quote.destChainId,
            destToken: lc(quote.payoutToken.address),
            destAmount: quote.destAmount.toString(),
            destBuyer: lc(buyer.address),
            deliveryWindowSec: Number(DELIVERY_WINDOW),
            status: !onchain && sc.target !== "PENDING_PAYMENT" ? "FULFILLED" : "CREATED",
            expiresAt: new Date(Date.now() + 60 * 60_000),
            securityScore: quote.securityScore,
            estimatedSeconds: quote.estimatedSeconds,
            txHashes: [],
          },
        });
      }
    });
    created.push({ scenario: sc, orderId, ref, sellerKey: prod.sellerKey, productId: prod.id });

    if (!actors || !quote) continue;

    // ------------------------------------------------ real on-chain lifecycle
    const role = sc.buyer as AnvilRole;
    if (sc.crossChainPending) {
      const src = actors[quote.sourceChainId]!;
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      await src.routerCall(
        role,
        "createIntent",
        [
          {
            orderRef: ref,
            sourceToken: zeroAddress,
            sourceAmount: quote.sourceAmount,
            destChainId: BigInt(quote.destChainId),
            destToken: quote.payoutToken.address,
            destAmount: quote.destAmount,
            seller: seller.address,
            destBuyer: buyer.address,
            deliveryWindow: DELIVERY_WINDOW,
            expiry,
          },
        ],
        quote.sourceAmount,
      );
      await prisma.paymentIntent.updateMany({
        where: { orderId },
        data: { expiresAt: new Date(Number(expiry) * 1000) },
      });
      continue;
    }
    if (sc.target === "PENDING_PAYMENT") continue;

    const chain = actors[quote.destChainId]!;
    await chain.mintToken(quote.payToken.address, buyer.address, quote.sourceAmount);
    await chain.checkoutDirect(role, {
      orderRef: ref,
      token: quote.payToken.address,
      escrowAmount: quote.destAmount,
      seller: seller.address,
      buyerAccount: buyer.address,
      window: DELIVERY_WINDOW,
    });
    const escrowId = await chain.escrowIdForRef(ref, startBlocks.get(quote.destChainId)!);
    if (escrowId === undefined) throw new Error(`escrow order not found for ${sc.key}`);

    if (sc.dispute) {
      await chain.escrowCall(role, "raiseDispute", [escrowId, sc.dispute.reason]);
      if (sc.dispute.resolveBps !== undefined) {
        await chain.escrowCall("deployer", "resolveDispute", [
          escrowId,
          BigInt(sc.dispute.resolveBps),
        ]);
      }
    } else if (sc.target === "COMPLETED") {
      await chain.escrowCall(role, "confirmDelivery", [escrowId]);
    }
  }

  // ---------------------------------------------------------------- certificates, loyalty staking
  if (actors) {
    const chronos = sellerRows.chronos;
    const chain = actors[chronos.payoutChain.chain.id]!;
    // provenance records minted by the seller on the LOCAL chain; batch labels are clearly demo values
    for (const [key, batch] of [
      ["floral-maxi-dress", "LOCAL-DEMO-0001"],
      ["floral-maxi-dress", "LOCAL-DEMO-0002"],
      ["v-neck-maxi-dress", "LOCAL-DEMO-0003"],
      ["ombre-slip-dress", "LOCAL-DEMO-0004"],
    ] as const) {
      const p = productRows.get(key)!;
      await chain.authenticityCall("chronos", "mintCertificateWithDetails", [
        chronos.address,
        p.id,
        "Trestle Studio",
        batch,
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/certificates/metadata/${p.id}`,
      ]);
    }
    // the sold dress's certificate moves to its buyer → on-chain provenance
    await chain.authenticityCall("chronos", "transferFrom", [
      chronos.address,
      buyers.ava.address,
      1n,
    ]);

    // Ava stakes half of the TRST she actually earned on chain B (amount depends on catalogue prices)
    const bChain = actors[B.chain.id]!;
    const earned = (await bChain.public.readContract({
      address: getDeployment(mode, B.chain.id)!.loyalty,
      abi: trestleLoyaltyAbi,
      functionName: "balanceOf",
      args: [buyers.ava.address],
    })) as bigint;
    if (earned > 1n) await bChain.loyaltyCall("ava", "stake", [earned / 2n]);
  }

  // ---------------------------------------------------------------- ingest real chain events
  if (actors) {
    for (const [id, actor] of Object.entries(actors)) {
      const chainId = Number(id);
      const dep = getDeployment(mode, chainId)!;
      const head = await actor.public.getBlockNumber();
      const events = await fetchTrestleEvents(
        actor.public,
        mode,
        chainId,
        BigInt(dep.deployBlock),
        head,
      );
      const results = await applyChainEvents(prisma, events);
      const applied = results.filter((r) => r.status === "applied").length;
      console.log(`  chain ${chainId}: ingested ${events.length} events (${applied} applied)`);
      await prisma.relayerCheckpoint.upsert({
        where: { id: `${chainId}` },
        create: { id: `${chainId}`, chainId, lastBlock: head },
        update: { lastBlock: head },
      });
    }
    // certificate metadata that events don't carry
    for (const c of await prisma.authenticityCertificate.findMany()) {
      const p = [...productRows.values()].find((x) => x.id === c.productId);
      const man = p ? "Trestle Studio" : undefined;
      await prisma.authenticityCertificate.update({
        where: { id: c.id },
        data: {
          manufacturer: man ?? null,
          metadataUri: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/certificates/metadata/${p?.id ?? c.productId}`,
        },
      });
    }
  }

  // ---------------------------------------------------------------- off-chain lifecycle (shipping)
  for (const c of created) {
    const sc = c.scenario;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } });
    const data: Prisma.OrderUpdateInput = {};
    if (sc.tracking) {
      data.trackingNumber = sc.tracking;
      data.carrier = sc.tracking.startsWith("1Z") ? "UPS" : "USPS";
      data.shippedAt = new Date(Date.now() - 3 * 24 * 3600_000);
    }
    if (
      onchain &&
      (sc.target === "SHIPPED" || sc.target === "DELIVERED") &&
      order.status === "ESCROWED"
    ) {
      data.status = sc.target; // carrier-side states are off-chain by design
    }
    if (!onchain && sc.target === "COMPLETED") data.completedAt = new Date();
    if (Object.keys(data).length) await prisma.order.update({ where: { id: c.orderId }, data });

    if (!onchain && sc.dispute) {
      await prisma.dispute.create({
        data: {
          orderId: c.orderId,
          raisedById: buyers[sc.buyer].id,
          raisedByAddress: lc(buyers[sc.buyer].address),
          reason: sc.dispute.reason,
          status: sc.dispute.resolveBps !== undefined ? "RESOLVED" : "OPEN",
          buyerShareBps: sc.dispute.resolveBps ?? null,
          resolutionNotes: sc.dispute.notes ?? null,
          resolvedById: sc.dispute.resolveBps !== undefined ? admin.id : null,
          resolvedAt: sc.dispute.resolveBps !== undefined ? new Date() : null,
        },
      });
    } else if (onchain && sc.dispute?.notes) {
      await prisma.dispute.updateMany({
        where: { orderId: c.orderId },
        data: { resolutionNotes: sc.dispute.notes },
      });
    }

  }

  // ---------------------------------------------------------------- demo reputation/loyalty history (no chain)
  if (!onchain) {
    const demoRep: [
      string,
      string,
      "PURCHASE_COMPLETED" | "SALE_COMPLETED" | "DISPUTE_LOST" | "DISPUTE_SPLIT",
      number,
      string,
    ][] = [
      [buyers.ava.id, buyers.ava.address, "PURCHASE_COMPLETED", 10, "10"],
      [buyers.noah.id, buyers.noah.address, "PURCHASE_COMPLETED", 10, "10"],
      [buyers.noah.id, buyers.noah.address, "PURCHASE_COMPLETED", 10, "20"],
      [buyers.ava.id, buyers.ava.address, "DISPUTE_SPLIT", -5, "5"],
    ];
    for (const [userId, address, eventType, weight, newScore] of demoRep) {
      await prisma.reputationEvent.create({
        data: {
          userId,
          address: lc(address),
          chainId: B.chain.id,
          eventType,
          weight,
          newScore,
          isSeedDemo: true,
        },
      });
      await prisma.user.update({ where: { id: userId }, data: { reputationScoreCache: newScore } });
    }
    for (const [key, sellerData] of Object.entries(sellerRows)) {
      const u = await prisma.seller.findUniqueOrThrow({ where: { id: sellerData.id } });
      const score = key === "lumen" ? "-25" : "20";
      await prisma.reputationEvent.create({
        data: {
          userId: u.userId,
          address: lc(sellerData.address),
          chainId: sellerData.payoutChain.chain.id,
          eventType: key === "lumen" ? "DISPUTE_LOST" : "SALE_COMPLETED",
          weight: key === "lumen" ? -25 : 10,
          newScore: score,
          isSeedDemo: true,
        },
      });
      await prisma.user.update({ where: { id: u.userId }, data: { reputationScoreCache: score } });
    }
    await prisma.loyaltyTransaction.createMany({
      data: [
        {
          userId: buyers.ava.id,
          address: lc(buyers.ava.address),
          chainId: B.chain.id,
          type: "EARNED",
          amount: (625n * 10n ** 17n).toString(),
          isSeedDemo: true,
        },
        {
          userId: buyers.ava.id,
          address: lc(buyers.ava.address),
          chainId: B.chain.id,
          type: "STAKED",
          amount: (50n * 10n ** 18n).toString(),
          isSeedDemo: true,
        },
        {
          userId: buyers.noah.id,
          address: lc(buyers.noah.address),
          chainId: B.chain.id,
          type: "EARNED",
          amount: (825n * 10n ** 16n).toString(),
          isSeedDemo: true,
        },
      ],
    });
  }

  const counts = await prisma.$transaction([
    prisma.user.count(),
    prisma.seller.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.chainEvent.count(),
    prisma.review.count(),
  ]);
  const byStatus = await prisma.order.groupBy({ by: ["status"], _count: true });
  console.log(
    `Seeded users=${counts[0]} sellers=${counts[1]} products=${counts[2]} orders=${counts[3]} chainEvents=${counts[4]} reviews=${counts[5]}`,
  );
  console.log("Orders by status:", Object.fromEntries(byStatus.map((s) => [s.status, s._count])));
  if (onchain) {
    console.log(
      "Demo wallets (Anvil public dev keys — import into your wallet for the local demo only):",
    );
    for (const r of ["deployer", "ava", "noah", "chronos", "sole", "lumen"] as AnvilRole[]) {
      console.log(`  ${r.padEnd(8)} ${anvilAddress(r)}  ${ANVIL_KEYS[r]}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
