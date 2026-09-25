import { keccak256, toBytes, type Hex } from "viem";

/** On-chain order reference for an off-chain Trestle order id. */
export function orderRefFor(orderId: string): Hex {
  return keccak256(toBytes(`trestle:order:${orderId}`));
}

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "ESCROWED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "DISPUTED",
  "COMPLETED",
  "REFUNDED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const INTENT_STATUSES = ["CREATED", "ROUTING", "FULFILLED", "FAILED"] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  ESCROWED: "Paid · in escrow",
  PROCESSING: "Paid · preparing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  DISPUTED: "Disputed",
  COMPLETED: "Completed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

/** On-chain escrow status enum (TrestleEscrow.Status). */
export const ESCROW_STATUS = [
  "None",
  "Created",
  "Disputed",
  "Released",
  "Refunded",
  "Split",
] as const;
export type EscrowStatus = (typeof ESCROW_STATUS)[number];

/** TrestleReputation ReputationEventType enum. */
export const REPUTATION_EVENT_TYPES = [
  "PURCHASE_COMPLETED",
  "SALE_COMPLETED",
  "AUTO_RELEASED",
  "DISPUTE_WON",
  "DISPUTE_LOST",
  "DISPUTE_SPLIT",
  "SELLER_REFUNDED",
] as const;
export type ReputationEventType = (typeof REPUTATION_EVENT_TYPES)[number];

/** Apparel categories (slugs). Labels live in apparel.ts (CATEGORY_LABEL). */
export const PRODUCT_CATEGORIES = ["dresses", "t-shirts", "jeans", "shorts", "knit-hats"] as const;
