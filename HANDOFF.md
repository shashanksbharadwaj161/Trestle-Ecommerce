# Trestle — session handoff (for Codex)

Branch `claude/festive-dirac-bk0eb4`. The final SHA is the commit that adds this file (`git log -1`). The previous pushed checkpoint is `9ab90a1`.
Constraint in force: **nothing paid.** Free tiers only; Stripe **test mode only**.

## What is implemented (Phase 2: clothing store)
- **Catalogue & data:** Apparel data model with additive migrations `20260926090000_apparel_card_payments` and `20260926090100_data_api_hardening`.
  - Products carry department, category, material, fit, care and size chart.
  - Supporting tables: ProductImage (colour, credit, licence, width/height), colour × size SKUs with stock, Collections, Wishlist.
  - Card fields: CardPayment, StripeEvent ledger, PromoCode.
  - Operations: ReturnRequest, ContactMessage.
  - Accounts: nullable `buyerId` (guest orders); email/password accounts (scrypt) with nullable `walletAddress`.
- **Seed:** Idempotent and non-destructive (create-if-missing, no default reset). `--reset` is refused for non-local DB hosts. `--catalog` is catalogue-only. Demo users/orders are created only on a local DB or with explicit `--demo`. No seeded reviews.
- **Storefront:**
  - Home (campaign, collections, New-in shelf, editorial + shoppable denim, categories, services).
  - Women / Men / Accessories / New in / Collections / Search. Filters and sort are URL-backed: category, colour, size (in stock, same SKU as colour), price, in-stock. Filter sheet, editorial tiles, load-more.
  - PDP: gallery with zoom viewer, colour/size matrix with sold-out states, size guide (cm/in), accordions, mobile sticky add-to-bag, JSON-LD, related shelf.
  - Header mega-menu, search overlay, bag drawer, mobile menu.
  - Server-side guest bag (cookie) merged on sign-in. Wishlist (local for guests, synced for accounts).
  - Content pages: help, contact, size guide, care, delivery, returns, payments, privacy/terms (marked owner placeholders), credits.
- **Accounts:**
  - Email register/login.
  - SIWE wallet linking only while signed in; a wallet is never moved between accounts.
  - Profile/credentials page, order history, wallet & escrow, loyalty.
  - Wagmi/RainbowKit load only on crypto routes.
- **Card checkout (Stripe Checkout, hosted):**
  - Server totals in exact cents; promo codes via one-off coupon; atomic stock reservation.
  - Signed webhook is the only path to PAID. It is idempotent, row-locked, monotonic, and checks the amount. It handles async success/failure, expiry, refunds, and oversell (late payment is auto-refunded).
  - Cancel expires the session first. A retry replaces the open session. Sweeper runs lazily plus via daily cron.
  - Guest access uses an opaque token (only the hash is stored) and a private link; claim-to-account is supported.
  - **Live keys are refused.**
- **Operations:**
  - Returns: request → approve → receive (restock) → Stripe refund.
  - Seller/admin fulfilment: carrier + tracking → delivered.
  - Admin: overview, products (edit any seller's product, images, variants/SKUs, stock), orders (ship/deliver, cancel+refund, partial refund), returns, messages.
  - Image **upload** (JPEG/PNG/WebP/AVIF, real-byte validation, ≥1000px long edge, 1600px+ recommended). Uploads go to Supabase Storage, or a local `.uploads` folder in dev. Reorder, alt text, and colour tag per image.
- **Crypto:** Escrow, disputes, reputation, loyalty and provenance are kept. Crypto checkout is at `/checkout/crypto?seller=…` and requires a verified wallet. The relayer has a new `RELAYER_ONCE=1` single-tick mode (`pnpm --filter @trestle/web relayer:once`).

## Latest verified results (this session, local sandbox)
- `tsc --noEmit` (web, db, shared): 0 errors. `eslint .` (web): clean.
- `next build` (production): passed after the latest UI/seed edits.
  - Storefront first-load JS is 106–195 kB; crypto routes are 360–408 kB.
- Vitest (web): `api.test.ts` 19/19, `store.test.ts` 23/23, `uploads.test.ts` 2/2. Shared: 16/16.
- **Card tests run against a LOCAL MOCK of the Stripe API** (`apps/web/test/mock-stripe.ts`). Webhook signatures are real (Stripe SDK). **No real Stripe (test-mode) transaction has been run.**
- Seed on a fresh DB with local Anvil chains (on-chain demo orders): succeeded. Re-run: creates nothing new.
- Supabase isolation was simulated on local Postgres with `anon`/`authenticated` roles: RLS was on for all tables and anon got "permission denied". **Not run against the real Supabase project.**
- Contrast tokens: all AA (`node apps/web/scripts/check-contrast.mjs`).

## NOT done / unverified — Codex must finish
1. **Designer imagery (open requirement).**
   - The catalogue still uses the MIT Sylius demo set: 960×1280, AI-generated, resort/beach. It does **not** meet the Zara/Prada-level, 1600–2400px, multi-angle requirement.
   - Only Codex's free starter pack (`597f40f`) is integrated. The blouse is one product with a single image. The gown is an editorial hero image only.
   - Tailoring, outerwear, knitwear and full dresses/essentials remain to be curated from free licensed high-res assets, matched to products, with visual QA. Seed image refs accept absolute `/images/...` paths plus `FREE_ASSETS` provenance in `packages/db/seed/catalog.ts`.
2. **Browser E2E and QA not rerun after the redesign:**
   - `apps/web/scripts/ui-e2e.ts` (crypto UI flow; still expects the old "Buy now" PDP button — must be updated to Add to bag → /checkout → Stablecoin → /checkout/crypto).
   - `smoke-pages.ts` (update the route list; 390/768/1440; add axe).
   - `e2e-local.ts` (API crypto E2E).
   - No axe or Lighthouse numbers were collected. The new home hero (studio images) was built but **not screenshot-reviewed**.
   - Earlier visual review covered home, the listing and the PDP at 390/1440 (old hero).
3. Not verified at all: real Stripe test mode, real Supabase, Upstash REST, WalletConnect, Docker, public testnets (all blocked or unavailable in the sandbox).
4. No password-reset email (no free email provider configured); the UI says to contact support.

## Free-only deployment (no paid plans)
- **Supabase Free** (existing project `aerxltizzvqipaylfglf`; do not create another):
  - `DATABASE_URL` = transaction pooler `:6543` with `?pgbouncer=true&connection_limit=1&schema=trestle&sslmode=require`.
  - `DIRECT_URL` = session pooler `:5432` with `?schema=trestle&sslmode=require`.
  - Run `pnpm --filter @trestle/db migrate:deploy`. Never reset, db push, or drop.
  - Then `pnpm --filter @trestle/db exec tsx seed.ts --catalog` (catalogue only; no demo users in production).
  - Keep the `trestle` schema out of the Data API exposed schemas.
  - Optional Storage: create a public bucket `product-images`, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-only) on Vercel.
  - TLS: add the Supabase CA via `sslcert` if Prisma rejects the certificate. Never disable verification.
- **Vercel Hobby** (free, non-commercial) for the app, API and cron:
  - `apps/web/vercel.json` sets a daily cron on `/api/cron/card-reservations` (set `CRON_SECRET`).
  - Env names: `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `SIWE_SECRET`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY` (sk_test_), `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `NETWORK_MODE`, and the optional crypto RPC vars (see `.env.example`).
  - The Hobby image-optimisation quota is limited; it does not auto-bill on Hobby.
- **Upstash Redis Free:** sessions, bag, rate limits.
- **Stripe TEST MODE:**
  - Webhook endpoint `https://<app>/api/webhooks/stripe`.
  - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
  - Stock is released by the `expired` webhook, so no worker is needed for card checkout.
- **Render:** not used. Background workers have no free plan, and free web services sleep. The old blueprint is `docs/optional/render-relayer-worker.PAID.example.yaml` (reference only).
  - **Limitation:** there is no continuous crypto relaying on free tiers. Cross-chain intents and escrow auto-release only progress when `relayer:once` is run manually or locally. The storefront and card test checkout do not depend on it.
