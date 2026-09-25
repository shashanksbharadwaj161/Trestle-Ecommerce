import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@trestle/shared";

export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid address")
  .transform((a) => a.toLowerCase() as `0x${string}`);
export const txHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash")
  .transform((h) => h.toLowerCase() as `0x${string}`);
export const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "Invalid hex");
export const usdAmount = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a USD amount like 129.99");
export const chainId = z.coerce.number().int().positive();
export const id = z.string().min(1).max(64);

const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u.startsWith("/art/") || /^https:\/\/[^\s]+$/.test(u), "Use an https:// image URL");

export const variantInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,40}$/, "SKU: 3-40 letters, digits or dashes")
    .transform((s) => s.toUpperCase()),
  stock: z.coerce.number().int().min(0).max(100_000),
  attributes: z.record(z.string().max(40)).default({}),
});

export const productInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  price: usdAmount,
  category: z.enum(PRODUCT_CATEGORIES),
  images: z.array(imageUrl).min(1).max(8),
  manufacturer: z.string().trim().max(80).optional().nullable(),
  chainListingOptions: z.array(z.number().int().positive()).min(1).max(8),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  featured: z.boolean().optional(),
  variants: z.array(variantInput).min(1).max(30),
});
export type ProductInput = z.infer<typeof productInput>;

export const productQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(40).optional(),
  minPrice: usdAmount.optional(),
  maxPrice: usdAmount.optional(),
  chain: chainId.optional(),
  seller: z.string().max(64).optional(),
  sort: z.enum(["featured", "newest", "price-asc", "price-desc", "rating"]).default("featured"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
  mine: z.enum(["1", "true"]).optional(),
});
export type ProductQuery = z.infer<typeof productQuery>;

export const cartMutation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), variantId: id, quantity: z.number().int().min(1).max(20) }),
  z.object({ op: z.literal("set"), variantId: id, quantity: z.number().int().min(0).max(20) }),
  z.object({ op: z.literal("remove"), variantId: id }),
  z.object({ op: z.literal("clear") }),
  z.object({
    op: z.literal("merge"),
    items: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(20) })).max(50),
  }),
]);

export const shippingAddress = z.object({
  name: z.string().trim().min(2).max(80),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().length(2, "2-letter country code").transform((c) => c.toUpperCase()),
});

export const quoteInput = z.object({
  sellerId: id,
  payChainId: chainId.optional(),
  payToken: address.optional(),
  /** Optional explicit items (Buy Now); defaults to the seller's items in the server cart. */
  items: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(20) })).max(30).optional(),
});

export const initiateInput = z.object({
  quoteId: z.string().regex(/^q_[0-9a-f]{32}$/),
  routeKey: z.string().max(200),
  buyerAccountMode: z.enum(["smart", "wallet"]).default("smart"),
  shippingAddress,
});

export const syncInput = z.object({ chainId, txHash });

export const disputeInput = z.object({
  orderId: id,
  reason: z.string().trim().min(10).max(1000),
  evidence: z.string().trim().max(2000).optional(),
});

export const resolveInput = z.object({
  buyerShareBps: z.number().int().min(0).max(10_000),
  notes: z.string().trim().min(5).max(2000),
});

export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  text: z.string().trim().min(10).max(2000),
});

export const shipInput = z.object({
  action: z.enum(["ship", "deliver"]),
  trackingNumber: z.string().trim().min(4).max(60).optional(),
});

export const onboardingInput = z.object({
  storefrontName: z.string().trim().min(3).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/, "3-40 chars: lowercase letters, digits, dashes"),
  bio: z.string().trim().max(600).default(""),
  payoutChainId: chainId,
  payoutToken: address,
  payoutAddress: address.optional(),
});

export const aaAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirmDelivery"), orderId: id }),
  z.object({ action: z.literal("raiseDispute"), orderId: id, reason: z.string().trim().min(10).max(1000) }),
  z.object({ action: z.literal("stake"), chainId, amount: z.string().regex(/^\d{1,40}$/) }),
  z.object({ action: z.literal("unstake"), chainId, amount: z.string().regex(/^\d{1,40}$/) }),
  z.object({ action: z.literal("claimRewards"), chainId }),
  z.object({
    action: z.literal("sweep"),
    chainId,
    token: address,
    amount: z.string().regex(/^\d{1,40}$/),
  }),
]);
export type AAAction = z.infer<typeof aaAction>;

export const userOpJson = z.object({
  sender: address,
  nonce: z.string().regex(/^\d+$/),
  initCode: hex,
  callData: hex,
  accountGasLimits: hex,
  preVerificationGas: z.string().regex(/^\d+$/),
  gasFees: hex,
  paymasterAndData: hex,
  signature: hex,
});

export const aaSubmit = z.object({
  chainId,
  userOp: userOpJson,
  signature: hex,
});
