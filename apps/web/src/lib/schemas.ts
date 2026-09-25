import { z } from "zod";
import { DEPARTMENTS, RETURN_REASONS, PRODUCT_CATEGORIES } from "@trestle/shared";

export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid address")
  .transform((a) => a.toLowerCase() as `0x${string}`);
export const txHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash")
  .transform((h) => h.toLowerCase() as `0x${string}`);
export const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "Invalid hex");
export const usdAmount = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a USD amount like 129.99");
export const chainId = z.coerce.number().int().positive();
export const id = z.string().min(1).max(64);

const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (u) => /^\/(images|api\/uploads)\/[A-Za-z0-9/_.-]+$/.test(u) || /^https:\/\/[^\s]+$/.test(u),
    "Use an https:// image URL, an uploaded image or a /images/ path",
  );

export const variantInput = z.object({
  id: z.string().optional(),
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,40}$/, "SKU: 3-40 letters, digits or dashes")
    .transform((s) => s.toUpperCase()),
  colour: z.string().trim().min(1).max(40),
  colourHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Hex colour like #1c1c1c")
    .optional()
    .nullable(),
  size: z.string().trim().min(1).max(20),
  stock: z.coerce.number().int().min(0).max(100_000),
});

export const imageInput = z.object({
  url: imageUrl,
  alt: z.string().trim().min(3).max(200),
  colour: z.string().trim().max(40).optional().nullable(),
  credit: z.string().trim().max(120).optional().nullable(),
  license: z.string().trim().max(120).optional().nullable(),
  sourceUrl: z.string().trim().url().max(500).optional().nullable(),
  width: z.number().int().positive().max(20_000).optional().nullable(),
  height: z.number().int().positive().max(20_000).optional().nullable(),
});

/** Prices must be whole cents so card totals are exact. */
export const centsPrice = usdAmount.refine(
  (v) => /^\d+(\.\d{1,2})?$/.test(v),
  "Prices must be whole cents (at most 2 decimals)",
);

export const productInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  price: centsPrice,
  department: z.enum(DEPARTMENTS),
  category: z.enum(PRODUCT_CATEGORIES),
  subcategory: z.string().trim().max(60).optional().nullable(),
  material: z.string().trim().max(200).optional().nullable(),
  fit: z.string().trim().max(200).optional().nullable(),
  care: z.array(z.string().trim().min(2).max(120)).max(8).default([]),
  sizeChartKey: z.string().max(40).optional().nullable(),
  images: z.array(imageInput).min(1).max(16),
  chainListingOptions: z.array(z.number().int().positive()).max(8).default([]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  featured: z.boolean().optional(),
  collections: z.array(z.string().max(60)).max(10).default([]),
  variants: z.array(variantInput).min(1).max(120),
});
export type ProductInput = z.infer<typeof productInput>;

const csv = z
  .union([z.string(), z.array(z.string())])
  .transform((v) =>
    (Array.isArray(v) ? v : v.split(","))
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

export const PRODUCT_SORTS = ["featured", "newest", "price-asc", "price-desc"] as const;

export const productQuery = z.object({
  q: z.string().trim().max(100).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  category: csv.optional(),
  collection: z.string().max(60).optional(),
  colour: csv.optional(),
  size: csv.optional(),
  minPrice: usdAmount.optional(),
  maxPrice: usdAmount.optional(),
  inStock: z.enum(["1", "true"]).optional(),
  new: z.enum(["1", "true"]).optional(),
  chain: chainId.optional(),
  seller: z.string().max(64).optional(),
  sort: z.enum(PRODUCT_SORTS).default("featured"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(96).default(24),
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
  country: z
    .string()
    .trim()
    .length(2, "2-letter country code")
    .transform((c) => c.toUpperCase()),
});

export const quoteInput = z.object({
  sellerId: id,
  payChainId: chainId.optional(),
  payToken: address.optional(),
  /** Optional explicit items (Buy Now); defaults to the seller's items in the server cart. */
  items: z
    .array(z.object({ variantId: id, quantity: z.number().int().min(1).max(20) }))
    .max(30)
    .optional(),
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
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/,
      "3-40 chars: lowercase letters, digits, dashes",
    ),
  bio: z.string().trim().max(600).default(""),
  payoutChainId: chainId,
  payoutToken: address,
  payoutAddress: address.optional(),
});

export const aaAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirmDelivery"), orderId: id }),
  z.object({
    action: z.literal("raiseDispute"),
    orderId: id,
    reason: z.string().trim().min(10).max(1000),
  }),
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

// ------------------------------------------------------------------ accounts
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);
export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Use at most 200 characters");

export const registerInput = z.object({
  email,
  password,
  name: z.string().trim().min(1, "Enter your name").max(80),
});
export const loginInput = z.object({ email, password: z.string().min(1).max(200) });
export const credentialsInput = z.object({
  email,
  password,
  currentPassword: z.string().max(200).optional(),
});
export const profileInput = z.object({ displayName: z.string().trim().min(1).max(80) });

export const wishlistMutation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), productId: id }),
  z.object({ op: z.literal("remove"), productId: id }),
  z.object({ op: z.literal("merge"), productIds: z.array(id).max(200) }),
]);

// ------------------------------------------------------------------ card checkout
export const cardCheckoutInput = z.object({
  shippingMethod: z.enum(["standard", "express"]),
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,32}$/, "Invalid code")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  email: email.optional().or(z.literal("").transform(() => undefined)),
});
export const cardTotalsInput = cardCheckoutInput.pick({ shippingMethod: true, promoCode: true });

export const returnInput = z.object({
  orderId: id,
  items: z
    .array(z.object({ orderItemId: id, quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(50),
  reason: z.enum(RETURN_REASONS),
  notes: z.string().trim().max(1000).optional(),
});

export const contactInput = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  topic: z.enum(["Order", "Returns", "Sizing", "Payment", "Other"]),
  orderRef: z.string().trim().max(64).optional(),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters)").max(4000),
  /** honeypot: must stay empty */
  website: z.string().max(0).optional().or(z.literal("")),
});

// ------------------------------------------------------------------ admin
export const adminOrderAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ship"),
    carrier: z.enum(["UPS", "USPS", "FEDEX", "DHL", "OTHER"]),
    trackingNumber: z.string().trim().min(4).max(60),
    trackingUrl: z.string().trim().url().max(500).optional(),
  }),
  z.object({ action: z.literal("deliver") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(500).optional() }),
  z.object({
    action: z.literal("refund"),
    amountCents: z.number().int().min(1),
    reason: z.string().trim().max(500).optional(),
  }),
]);
export const adminReturnAction = z.object({
  action: z.enum(["approve", "reject", "receive", "refund"]),
  adminNotes: z.string().trim().max(1000).optional(),
  refundCents: z.number().int().min(1).optional(),
});
export const stockPatch = z.object({
  variants: z.array(z.object({ id, stock: z.number().int().min(0).max(100_000) })).min(1).max(200),
});

export const forgotInput = z.object({ email });
export const resetInput = z.object({ token: z.string().min(20).max(100), password });
