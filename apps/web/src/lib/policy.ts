/**
 * Store policy copy shown across the site. OWNER CONTENT — replace with your real terms before launch.
 * Numbers come from @trestle/shared so the checkout and the copy can never disagree.
 */
import { RETURN_WINDOW_DAYS, SHIPPING_METHODS } from "@trestle/shared";

export const POLICY = {
  freeDeliveryOver: `$${(SHIPPING_METHODS.standard.freeOverCents / 100).toFixed(0)}`,
  standard: `${SHIPPING_METHODS.standard.label}: $${(SHIPPING_METHODS.standard.cents / 100).toFixed(2)}, ${SHIPPING_METHODS.standard.detail}. Free over $${(SHIPPING_METHODS.standard.freeOverCents / 100).toFixed(0)}.`,
  express: `${SHIPPING_METHODS.express.label}: $${(SHIPPING_METHODS.express.cents / 100).toFixed(2)}, ${SHIPPING_METHODS.express.detail}.`,
  returnDays: RETURN_WINDOW_DAYS,
  returns: `Request a return within ${RETURN_WINDOW_DAYS} days of delivery from your order page. Items must be unworn with tags attached. Refunds go back to your original payment method once the return is received.`,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
};
