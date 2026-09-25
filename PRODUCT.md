# Trestle — product brief

## What it is

Trestle is a clothing store for women and men: dresses, jersey tees, denim and knit hats, presented
with editorial photography and a quiet, precise interface. It is built as a small marketplace of
Trestle labels (**Trestle Studio**, **Trestle Denim**, **Trestle Knit**), so each order belongs to
one label.

Shoppers pay either way:

1. **Card** (default). Stripe Checkout hosted payment page. No account or wallet needed; guest
   orders are reachable through a private link.
2. **Stablecoin escrow** (optional). The original Trestle crypto flow: pay from any supported chain.
   Funds sit in an escrow contract until delivery, with disputes, on-chain reputation, the loyalty
   token and seller-issued provenance certificates. It is offered as a payment choice at checkout and
   explained on its own page. It is never part of the merchandising story.

The two rails are independent. If no chain is configured, crypto checkout is shown as unavailable and
card shopping still works. If Stripe is not configured, card checkout says so plainly and never
pretends to take payment.

## Audience and tone

Adults buying considered everyday clothes. Tone: calm, specific and factual. Sentence-case product
names say what the garment is (“Wide-leg jeans”, “Ruffle-hem mini dress”). No hype, no countdown
timers, no invented scarcity, no fake reviews, no invented certifications or guarantees.

## Core journeys

| Journey | Must work end-to-end |
|---|---|
| Browse | Home → Women / Men / Accessories / New arrivals / Collections → listing with search, filters (category, colour, size, price, availability) and sort, all URL-backed |
| Choose | Product page: gallery with zoom, colour and size selection with sold-out sizes, size guide with measurements, fit/material/care, delivery & returns |
| Save | Wishlist (browser for guests; synced to the account after sign-in) |
| Bag | Persistent guest bag (cookie + server), merged into the account bag on sign-in |
| Pay by card | Choose delivery, optional promo code → Stripe Checkout → signed webhook marks the order paid → confirmation page reads the webhook-driven status |
| Pay with stablecoin | Wallet sign-in (SIWE) → quote → escrow → delivery confirmation or dispute |
| After purchase | Order history, order detail with tracking, return request (card orders), dispute (escrow orders) |
| Help | Contact form, help centre, size guide, care, delivery, returns pages |
| Run the store | Admin: products (details, images, variants/SKUs, price, stock, status), orders (ship with carrier/tracking, deliver, refund), returns, contact messages, disputes, sellers |

## Rules that are not negotiable

- Prices are exact integer minor units end-to-end. The server computes every total; the client only
  displays numbers the server returned.
- Only a verified Stripe webhook can mark a card order paid. Success URLs never do.
- Stock is reserved atomically when checkout starts and released on expiry, failure or cancellation.
- Guest order access uses a random opaque token; only its SHA-256 hash is stored.
- Identities are never linked on an unverified email alone.
- Demo data is labelled as demo, and is only created locally or when explicitly requested.

## Owner content to replace before launch

Brand copy, legal pages (terms, privacy), the delivery/returns policy numbers (`apps/web/src/lib/policy.ts`),
size charts (`packages/shared/src/apparel.ts`), the catalogue and photography (`packages/db/seed/catalog.ts`),
and the support email. See `docs/CONNECTION_HANDOFF.md` for the full list.
