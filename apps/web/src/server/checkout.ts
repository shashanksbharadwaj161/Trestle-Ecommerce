import "server-only";
import { randomBytes } from "node:crypto";
import { encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from "viem";
import { prisma, type Prisma } from "@trestle/db";
import {
  computeRoute,
  findToken,
  getTokens,
  orderRefFor,
  priceTable,
  type RouteQuote,
} from "@trestle/shared";
import { testTokenAbi, trestlePaymentRouterAbi } from "@trestle/shared/abis";
import { env } from "./env";
import { chainProfile, chainProfiles, deployment, publicClient, requireDeployment } from "./chain";
import { ApiError, badRequest, conflict, forbidden, notFound, requireWallet } from "./http";
import { kv } from "./kv";
import { readCart, clearCartLines } from "./cart";
import { smartAccountFor } from "./accounts";
import type { AuthedUser } from "./session";

export interface QuoteItem {
  variantId: string;
  quantity: number;
}

export interface SerializedRoute {
  key: string;
  available: boolean;
  reason?: string;
  routeId?: string;
  kind?: "direct" | "cross-chain";
  label?: string;
  sourceChainId: number;
  destChainId: number;
  payToken: { address: string; symbol: string; decimals: number; isNative: boolean };
  payoutToken?: { address: string; symbol: string; decimals: number };
  sourceAmount?: string;
  destAmount?: string;
  feeAmount?: string;
  effectiveFeeBps?: number;
  solverSpreadUsdMicros?: string;
  estimatedSeconds?: number;
  securityScore?: number;
  securityNotes?: string[];
  steps?: string[];
  liquidity?: { available: string; sufficient: boolean };
}

interface StoredQuote {
  id: string;
  userId: string;
  sellerId: string;
  items: (QuoteItem & {
    unitPriceUsdMicros: string;
    productId: string;
    title: string;
    variantName: string;
  })[];
  subtotalUsdMicros: string;
  payoutChainId: number;
  payoutToken: string;
  payoutAddress: string;
  routes: SerializedRoute[];
  createdAt: number;
  expiresAt: number;
}

const routeKey = (chainId: number, token: string) => `${chainId}:${token.toLowerCase()}`;

async function effectiveFeeBps(chainId: number, payer: Address): Promise<bigint> {
  const dep = deployment(chainId);
  if (!dep) return BigInt(env().PROTOCOL_FEE_BPS);
  try {
    return (await publicClient(chainId).readContract({
      address: dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "effectiveFeeBps",
      args: [payer],
    })) as bigint;
  } catch {
    return BigInt(env().PROTOCOL_FEE_BPS);
  }
}

async function solverLiquidity(chainId: number, token: Address): Promise<bigint | undefined> {
  const dep = deployment(chainId);
  if (!dep) return undefined;
  try {
    return (await publicClient(chainId).readContract({
      address: dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "solverLiquidity",
      args: [dep.relayer, token],
    })) as bigint;
  } catch {
    return undefined;
  }
}

function serialize(q: RouteQuote, key: string, liquidity?: bigint): SerializedRoute {
  const sufficient = q.kind === "direct" || (liquidity !== undefined && liquidity >= q.destAmount);
  return {
    key,
    available: sufficient,
    reason: sufficient
      ? undefined
      : "Solver liquidity on the destination chain is insufficient for this order right now.",
    routeId: q.routeId,
    kind: q.kind,
    label: q.label,
    sourceChainId: q.sourceChainId,
    destChainId: q.destChainId,
    payToken: {
      address: q.payToken.address,
      symbol: q.payToken.symbol,
      decimals: q.payToken.decimals,
      isNative: q.payToken.isNative,
    },
    payoutToken: {
      address: q.payoutToken.address,
      symbol: q.payoutToken.symbol,
      decimals: q.payoutToken.decimals,
    },
    sourceAmount: q.sourceAmount.toString(),
    destAmount: q.destAmount.toString(),
    feeAmount: q.feeAmount.toString(),
    effectiveFeeBps: Number(q.effectiveFeeBps),
    solverSpreadUsdMicros: q.solverSpreadUsdMicros.toString(),
    estimatedSeconds: q.estimatedSeconds,
    securityScore: q.securityScore,
    securityNotes: q.securityNotes,
    steps: q.steps,
    liquidity:
      q.kind === "cross-chain"
        ? { available: (liquidity ?? 0n).toString(), sufficient }
        : undefined,
  };
}

export async function createQuote(
  user: AuthedUser,
  input: { sellerId: string; items?: QuoteItem[]; payChainId?: number; payToken?: string },
) {
  const e = env();
  const seller = await prisma.seller.findUnique({ where: { id: input.sellerId } });
  if (!seller) throw notFound("Seller");
  if (seller.userId === user.id) throw badRequest("You cannot buy from your own storefront");

  let items = input.items;
  if (!items || items.length === 0) {
    const cart = await readCart(user.id);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: cart.map((l) => l.variantId) }, product: { sellerId: seller.id } },
      select: { id: true },
    });
    const ids = new Set(variants.map((v) => v.id));
    items = cart.filter((l) => ids.has(l.variantId));
  }
  if (!items || items.length === 0) throw badRequest("No items from this seller in your cart");

  const merged = new Map<string, number>();
  for (const it of items) merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + it.quantity);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: { product: true },
  });
  if (variants.length !== merged.size) throw notFound("One or more items");

  let subtotal = 0n;
  let chains: number[] | undefined;
  const lines: StoredQuote["items"] = [];
  for (const v of variants) {
    const qty = merged.get(v.id)!;
    if (v.product.sellerId !== seller.id)
      throw badRequest("All items must come from the same seller");
    if (v.product.status !== "ACTIVE")
      throw conflict(`“${v.product.title}” is not currently for sale`);
    if (v.stock < qty)
      throw conflict(`Only ${v.stock} left of “${v.product.title} — ${v.name}”`, {
        variantId: v.id,
      });
    subtotal += v.product.priceUsdMicros * BigInt(qty);
    chains = chains
      ? chains.filter((c) => v.product.chainListingOptions.includes(c))
      : [...v.product.chainListingOptions];
    lines.push({
      variantId: v.id,
      quantity: qty,
      unitPriceUsdMicros: v.product.priceUsdMicros.toString(),
      productId: v.product.id,
      title: v.product.title,
      variantName: v.name,
    });
  }

  const destProfile = chainProfile(seller.payoutChainId);
  const payoutToken = findToken(e.mode, seller.payoutChainId, seller.payoutToken);
  if (!destProfile || !payoutToken)
    throw new ApiError(
      409,
      "seller_payout_unavailable",
      "Seller payout configuration is not supported on this network",
    );

  const prices = priceTable(e.PRICE_ETH_USD);
  const payer = getAddress(requireWallet(user));
  const routes: SerializedRoute[] = [];
  const allowedChains = chainProfiles().filter(
    (p) => (chains ?? []).includes(p.chain.id) && deployment(p.chain.id),
  );
  const liquidityCache = new Map<string, bigint | undefined>();

  for (const src of allowedChains) {
    const feeBps = await effectiveFeeBps(src.chain.id, payer);
    for (const token of getTokens(e.mode, src.chain.id)) {
      const key = routeKey(src.chain.id, token.address);
      const q = computeRoute({
        subtotalUsdMicros: subtotal,
        payToken: token,
        payoutToken,
        sourceProfile: src,
        destProfile,
        prices,
        effectiveFeeBps: feeBps,
        solverSpreadBps: BigInt(e.SOLVER_SPREAD_BPS),
      });
      if (q.routeId === "unavailable") {
        routes.push({
          key,
          available: false,
          reason: q.reason,
          sourceChainId: src.chain.id,
          destChainId: destProfile.chain.id,
          payToken: {
            address: token.address,
            symbol: token.symbol,
            decimals: token.decimals,
            isNative: token.isNative,
          },
        });
        continue;
      }
      let liq: bigint | undefined;
      if (q.kind === "cross-chain") {
        const lk = `${q.destChainId}:${q.payoutToken.address}`;
        if (!liquidityCache.has(lk))
          liquidityCache.set(lk, await solverLiquidity(q.destChainId, q.payoutToken.address));
        liq = liquidityCache.get(lk);
      }
      routes.push(serialize(q, key, liq));
    }
  }

  const now = Date.now();
  const stored: StoredQuote = {
    id: `q_${randomBytes(16).toString("hex")}`,
    userId: user.id,
    sellerId: seller.id,
    items: lines,
    subtotalUsdMicros: subtotal.toString(),
    payoutChainId: seller.payoutChainId,
    payoutToken: seller.payoutToken,
    payoutAddress: seller.payoutAddress,
    routes,
    createdAt: now,
    expiresAt: now + e.QUOTE_TTL_SECONDS * 1000,
  };
  await kv().set(`quote:${stored.id}`, JSON.stringify(stored), { ex: e.QUOTE_TTL_SECONDS });

  const requested =
    input.payChainId && input.payToken ? routeKey(input.payChainId, input.payToken) : undefined;
  const best =
    routes.find((r) => r.key === requested && r.available)?.key ??
    routes.find((r) => r.available && r.kind === "direct")?.key ??
    routes.find((r) => r.available)?.key;

  return {
    quoteId: stored.id,
    expiresAt: new Date(stored.expiresAt).toISOString(),
    seller: {
      id: seller.id,
      storefrontName: seller.storefrontName,
      payoutChainId: seller.payoutChainId,
    },
    items: lines,
    subtotalUsdMicros: subtotal.toString(),
    routes,
    recommendedKey: best ?? null,
    priceSource: `Demo price table (ETH = $${(Number(prices.ETH) / 1e6).toFixed(2)}) — not a live oracle`,
  };
}

export interface TxCall {
  chainId: number;
  to: Address;
  data: Hex;
  value: string;
  description: string;
  /** for approvals: skip if allowance >= this amount */
  requiresAllowance?: { token: Address; owner: Address; spender: Address; amount: string };
}

export async function planFor(intentId: string) {
  const intent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: intentId },
    include: { order: { include: { seller: true } } },
  });
  const dep = requireDeployment(intent.sourceChainId);
  const payer = getAddress(intent.payer);
  const token = getAddress(intent.sourceToken) as Address;
  const isNative = token === zeroAddress;
  const sourceAmount = BigInt(intent.sourceAmount.toFixed());
  const calls: TxCall[] = [];
  if (!isNative) {
    calls.push({
      chainId: intent.sourceChainId,
      to: token,
      data: encodeFunctionData({
        abi: testTokenAbi,
        functionName: "approve",
        args: [dep.paymentRouter, sourceAmount],
      }),
      value: "0",
      description: "Approve Trestle router to move your tokens",
      requiresAllowance: {
        token,
        owner: payer,
        spender: dep.paymentRouter,
        amount: sourceAmount.toString(),
      },
    });
  }
  if (intent.routeKind === "DIRECT") {
    calls.push({
      chainId: intent.sourceChainId,
      to: dep.paymentRouter,
      data: encodeFunctionData({
        abi: trestlePaymentRouterAbi,
        functionName: "checkoutDirect",
        args: [
          intent.order.onchainRef as Hex,
          token,
          BigInt(intent.destAmount.toFixed()),
          getAddress(intent.order.seller.payoutAddress),
          getAddress(intent.destBuyer),
          BigInt(intent.deliveryWindowSec),
        ],
      }),
      value: isNative ? BigInt(intent.destAmount.toFixed()).toString() : "0",
      description: "Pay into escrow",
    });
  } else {
    calls.push({
      chainId: intent.sourceChainId,
      to: dep.paymentRouter,
      data: encodeFunctionData({
        abi: trestlePaymentRouterAbi,
        functionName: "createIntent",
        args: [
          {
            orderRef: intent.order.onchainRef as Hex,
            sourceToken: token,
            sourceAmount,
            destChainId: BigInt(intent.destChainId),
            destToken: getAddress(intent.destToken),
            destAmount: BigInt(intent.destAmount.toFixed()),
            seller: getAddress(intent.order.seller.payoutAddress),
            destBuyer: getAddress(intent.destBuyer),
            deliveryWindow: BigInt(intent.deliveryWindowSec),
            expiry: BigInt(Math.floor(intent.expiresAt.getTime() / 1000)),
          },
        ],
      }),
      value: isNative ? sourceAmount.toString() : "0",
      description: "Lock payment and create cross-chain intent",
    });
  }
  return {
    orderId: intent.orderId,
    paymentIntentId: intent.id,
    chainId: intent.sourceChainId,
    calls,
    expiresAt: intent.expiresAt,
  };
}

export async function initiateCheckout(
  user: AuthedUser,
  input: {
    quoteId: string;
    routeKey: string;
    buyerAccountMode: "smart" | "wallet";
    shippingAddress: Prisma.InputJsonValue;
  },
) {
  const e = env();
  // idempotent retry: the same quote always maps to the same order
  const existing = await prisma.paymentIntent.findUnique({ where: { quoteId: input.quoteId } });
  if (existing) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: existing.orderId } });
    if (order.buyerId !== user.id) throw forbidden();
    return { ...(await planFor(existing.id)), idempotentReplay: true };
  }

  const raw = await kv().get(`quote:${input.quoteId}`);
  if (!raw)
    throw new ApiError(410, "quote_expired", "This quote has expired — please refresh the quote");
  const quote = JSON.parse(raw) as StoredQuote;
  if (quote.userId !== user.id) throw forbidden("Quote belongs to another session");
  if (quote.expiresAt < Date.now())
    throw new ApiError(410, "quote_expired", "This quote has expired — please refresh the quote");
  const route = quote.routes.find((r) => r.key === input.routeKey);
  if (!route || !route.available || !route.sourceAmount || !route.destAmount || !route.kind) {
    throw badRequest(route?.reason ?? "Selected route is not available");
  }
  // one initiation per quote even under concurrent requests
  const locked = await kv().set(`quote-lock:${quote.id}`, user.id, { ex: 60, nx: true });
  if (!locked) throw conflict("Checkout for this quote is already being processed");

  try {
    const destBuyer =
      input.buyerAccountMode === "smart"
        ? await smartAccountFor(user.id, getAddress(requireWallet(user)), route.destChainId)
        : getAddress(requireWallet(user));
    const orderId = `ord_${randomBytes(10).toString("hex")}`;
    const intentExpiry = new Date(Date.now() + e.INTENT_TTL_SECONDS * 1000);
    // hold stock until the intent can no longer be fulfilled (expiry) + refund grace + margin
    const reservationExpiresAt = new Date(intentExpiry.getTime() + 45 * 60_000);

    const intent = await prisma.$transaction(async (tx) => {
      for (const it of quote.items) {
        const res = await tx.productVariant.updateMany({
          where: { id: it.variantId, stock: { gte: it.quantity }, product: { status: "ACTIVE" } },
          data: { stock: { decrement: it.quantity } },
        });
        if (res.count !== 1)
          throw conflict(`“${it.title} — ${it.variantName}” just sold out`, {
            variantId: it.variantId,
          });
      }
      await tx.order.create({
        data: {
          id: orderId,
          buyerId: user.id,
          sellerId: quote.sellerId,
          status: "PENDING_PAYMENT",
          subtotalUsdMicros: BigInt(quote.subtotalUsdMicros),
          payoutChainId: quote.payoutChainId,
          payoutToken: quote.payoutToken,
          payoutAmount: route.destAmount!,
          onchainRef: orderRefFor(orderId).toLowerCase(),
          buyerAccount: destBuyer.toLowerCase(),
          reservationExpiresAt,
          shippingAddress: input.shippingAddress,
          items: {
            create: quote.items.map((it) => ({
              productId: it.productId,
              productVariantId: it.variantId,
              titleSnapshot: it.title,
              variantSnapshot: it.variantName,
              quantity: it.quantity,
              unitPriceUsdMicros: BigInt(it.unitPriceUsdMicros),
            })),
          },
        },
      });
      return tx.paymentIntent.create({
        data: {
          orderId,
          quoteId: quote.id,
          routeKind: route.kind === "direct" ? "DIRECT" : "CROSS_CHAIN",
          routeId: route.routeId!,
          payer: requireWallet(user),
          sourceChainId: route.sourceChainId,
          sourceToken: route.payToken.address.toLowerCase(),
          sourceAmount: route.sourceAmount!,
          feeAmount: route.feeAmount ?? "0",
          destChainId: route.destChainId,
          destToken: route.payoutToken!.address.toLowerCase(),
          destAmount: route.destAmount!,
          destBuyer: destBuyer.toLowerCase(),
          deliveryWindowSec: e.DELIVERY_WINDOW_DAYS * 86_400,
          expiresAt: intentExpiry,
          securityScore: route.securityScore ?? 0,
          estimatedSeconds: route.estimatedSeconds ?? 0,
          txHashes: [{ status: "QUOTED", at: new Date().toISOString(), note: route.label }],
        },
      });
    });
    await clearCartLines(
      user.id,
      quote.items.map((i) => i.variantId),
    );
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "checkout.initiate",
        entity: "Order",
        entityId: orderId,
        data: { routeKey: route.key },
      },
    });
    return { ...(await planFor(intent.id)), idempotentReplay: false };
  } catch (err) {
    await kv().del(`quote-lock:${quote.id}`);
    throw err;
  }
}
