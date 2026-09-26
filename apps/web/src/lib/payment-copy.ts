/** Customer-facing wording for the payment methods that are actually available. */
export interface PaymentAvailability {
  card: boolean;
  crypto: boolean;
}

export function paymentSummary(p: PaymentAvailability): string {
  if (p.card && p.crypto)
    return "Pay by card, or with stablecoins held in escrow until your order arrives.";
  if (p.card) return "Pay securely by card — no account needed.";
  if (p.crypto) return "Pay with stablecoins held in escrow until your order arrives.";
  return "Online checkout is temporarily unavailable. Your bag and wishlist are saved for when it reopens.";
}
