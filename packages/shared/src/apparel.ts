import { USD_MICROS } from "./pricing";
import type { PRODUCT_CATEGORIES } from "./order";

export type Category = (typeof PRODUCT_CATEGORIES)[number];
export const DEPARTMENTS = ["women", "men", "unisex"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  dresses: "Dresses",
  shirts: "Shirts & blouses",
  "t-shirts": "T-shirts",
  jeans: "Jeans",
  shorts: "Shorts",
  "knit-hats": "Knit hats",
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  women: "Women",
  men: "Men",
  unisex: "Accessories",
};

/** Size order used for sorting size selectors and filters. */
export const SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "38",
  "One size",
] as const;

export function sizeRank(size: string | null | undefined): number {
  const i = SIZE_ORDER.indexOf((size ?? "") as (typeof SIZE_ORDER)[number]);
  return i === -1 ? SIZE_ORDER.length : i;
}

export function sortSizes<T extends string>(sizes: T[]): T[] {
  return [...sizes].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
}

/**
 * Size charts. DEMO measurements for a fictional brand — a real store must replace these with its own
 * graded specs (see docs/CONNECTION_HANDOFF.md → owner content). Body measurements, centimetres.
 */
export interface SizeChart {
  key: string;
  title: string;
  /** column headers after "Size" */
  columns: string[];
  rows: { size: string; values: number[] }[];
  howToMeasure: string[];
}

export const SIZE_CHARTS: Record<string, SizeChart> = {
  "women-tops": {
    key: "women-tops",
    title: "Women’s tops & dresses",
    columns: ["Bust", "Waist", "Hip"],
    rows: [
      { size: "XS", values: [80, 62, 88] },
      { size: "S", values: [84, 66, 92] },
      { size: "M", values: [88, 70, 96] },
      { size: "L", values: [94, 76, 102] },
      { size: "XL", values: [100, 82, 108] },
    ],
    howToMeasure: [
      "Bust — around the fullest part of the chest, tape level under the arms.",
      "Waist — around the narrowest part of the natural waist.",
      "Hip — around the fullest part of the hips, feet together.",
    ],
  },
  "women-denim": {
    key: "women-denim",
    title: "Women’s jeans & shorts",
    columns: ["Waist", "Hip", "Inseam (jeans)"],
    rows: [
      { size: "24", values: [61, 86, 76] },
      { size: "25", values: [64, 89, 76] },
      { size: "26", values: [66, 91, 77] },
      { size: "27", values: [69, 94, 77] },
      { size: "28", values: [71, 96, 78] },
      { size: "29", values: [74, 99, 78] },
      { size: "30", values: [76, 101, 79] },
      { size: "31", values: [79, 104, 79] },
      { size: "32", values: [81, 106, 80] },
    ],
    howToMeasure: [
      "Waist — where the waistband sits, usually just below the navel.",
      "Hip — around the fullest part of the hips.",
      "Inseam — from the crotch seam to the ankle bone on the inside leg.",
    ],
  },
  "men-tops": {
    key: "men-tops",
    title: "Men’s tops",
    columns: ["Chest", "Waist", "Neck"],
    rows: [
      { size: "S", values: [92, 78, 37] },
      { size: "M", values: [98, 84, 39] },
      { size: "L", values: [104, 90, 41] },
      { size: "XL", values: [110, 96, 43] },
      { size: "XXL", values: [116, 102, 45] },
    ],
    howToMeasure: [
      "Chest — around the fullest part of the chest, under the arms.",
      "Waist — around the natural waistline.",
      "Neck — around the base of the neck, one finger under the tape.",
    ],
  },
  "men-denim": {
    key: "men-denim",
    title: "Men’s jeans & shorts",
    columns: ["Waist", "Hip", "Inseam (jeans)"],
    rows: [
      { size: "28", values: [72, 90, 81] },
      { size: "29", values: [74, 92, 81] },
      { size: "30", values: [77, 95, 82] },
      { size: "31", values: [79, 97, 82] },
      { size: "32", values: [82, 100, 83] },
      { size: "33", values: [84, 102, 83] },
      { size: "34", values: [87, 105, 84] },
      { size: "36", values: [92, 110, 84] },
      { size: "38", values: [97, 115, 85] },
    ],
    howToMeasure: [
      "Waist — where you usually wear your jeans.",
      "Hip — around the fullest part of the seat.",
      "Inseam — from the crotch seam to where you want the hem to fall.",
    ],
  },
  "one-size": {
    key: "one-size",
    title: "Knit hats",
    columns: ["Head circumference (stretches to)"],
    rows: [{ size: "One size", values: [60] }],
    howToMeasure: ["Measure around the head just above the ears and across the forehead."],
  },
};

export function cmToIn(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10;
}

// ---------------------------------------------------------------------------------------------
// Money in exact minor units for card checkout
// ---------------------------------------------------------------------------------------------

export const MICROS_PER_CENT = USD_MICROS / 100n; // 10_000n

/** Exact conversion; throws if a price is not a whole number of cents (prices are validated on write). */
export function microsToCents(micros: bigint): number {
  if (micros < 0n) throw new Error("negative amount");
  if (micros % MICROS_PER_CENT !== 0n) throw new Error(`amount ${micros} µUSD is not whole cents`);
  const cents = micros / MICROS_PER_CENT;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount too large");
  return Number(cents);
}

export function centsToMicros(cents: number): bigint {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("invalid cents");
  return BigInt(cents) * MICROS_PER_CENT;
}

export function formatCents(cents: number, currency = "usd"): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100).toString().padStart(2, "0");
  const sym = currency.toLowerCase() === "usd" ? "$" : `${currency.toUpperCase()} `;
  return `${neg ? "-" : ""}${sym}${whole}.${frac}`;
}

export const SHIPPING_METHODS = {
  standard: {
    id: "standard",
    label: "Standard delivery",
    detail: "3–5 business days",
    cents: 800,
    freeOverCents: 15_000,
    minDays: 3,
    maxDays: 5,
  },
  express: {
    id: "express",
    label: "Express delivery",
    detail: "1–2 business days",
    cents: 2_000,
    freeOverCents: null,
    minDays: 1,
    maxDays: 2,
  },
} as const;
export type ShippingMethodId = keyof typeof SHIPPING_METHODS;

export function shippingCentsFor(method: ShippingMethodId, subtotalAfterDiscountCents: number) {
  const m = SHIPPING_METHODS[method];
  if (m.freeOverCents !== null && subtotalAfterDiscountCents >= m.freeOverCents) return 0;
  return m.cents;
}

export interface PromoRule {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  minSubtotalCents: number;
}

/** Discount in cents for a subtotal. Percent discounts round down (in the customer's favour never exceeding the subtotal). */
export function discountCentsFor(promo: PromoRule | null, subtotalCents: number): number {
  if (!promo || subtotalCents < promo.minSubtotalCents) return 0;
  let d = 0;
  if (promo.percentOff != null) {
    if (promo.percentOff <= 0 || promo.percentOff > 100) return 0;
    d = Math.floor((subtotalCents * promo.percentOff) / 100);
  } else if (promo.amountOffCents != null) {
    d = Math.max(0, promo.amountOffCents);
  }
  return Math.min(d, subtotalCents);
}

export interface CardTotals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
}

export function computeCardTotals(input: {
  lines: { unitPriceMicros: bigint; quantity: number }[];
  shippingMethod: ShippingMethodId;
  promo: PromoRule | null;
}): CardTotals {
  let subtotalCents = 0;
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("invalid quantity");
    subtotalCents += microsToCents(l.unitPriceMicros) * l.quantity;
  }
  const discountCents = discountCentsFor(input.promo, subtotalCents);
  const shippingCents = shippingCentsFor(input.shippingMethod, subtotalCents - discountCents);
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + shippingCents,
  };
}

/**
 * Splits a discount across line amounts proportionally with the largest-remainder method so the parts
 * sum exactly to the discount. Used to attribute a cart-level discount to per-seller orders.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest -= 1;
  }
  return floors;
}

export const CARD_PAYMENT_STATUS_LABEL = {
  OPEN: "Awaiting payment",
  PROCESSING: "Payment processing",
  PAID: "Paid",
  FAILED: "Payment failed",
  EXPIRED: "Checkout expired",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
} as const;

/** Monotonic rank used to ignore out-of-order Stripe events. Terminal states share the top ranks. */
export const CARD_PAYMENT_RANK: Record<keyof typeof CARD_PAYMENT_STATUS_LABEL, number> = {
  OPEN: 0,
  PROCESSING: 1,
  FAILED: 2,
  EXPIRED: 2,
  PAID: 3,
  PARTIALLY_REFUNDED: 4,
  REFUNDED: 5,
};

export const RETURN_WINDOW_DAYS = 30;

export const RETURN_REASONS = [
  "Too small",
  "Too large",
  "Not as pictured",
  "Changed my mind",
  "Faulty or damaged",
  "Arrived too late",
  "Other",
] as const;
