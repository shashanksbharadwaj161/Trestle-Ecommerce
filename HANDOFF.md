# Trestle — session handoff

Branch `claude/festive-dirac-bk0eb4`. The final SHA is the commit that adds this file (`git log -1`); the checkpoint before
it is `4dec00e`. Constraint in force: **nothing paid** — free tiers only, Stripe **test mode only** (live keys are refused).

## Status in one paragraph

The clothing store (storefront, accounts, card checkout via hosted Stripe Checkout in test mode, returns, admin, image
upload, password reset) and the original stablecoin escrow flow are built and pass every local check listed below. What
is **not** done: the designer-grade photography (the catalogue still uses a low-resolution resort set), and nothing has
been run against the real external services (Stripe test account, Supabase project, Upstash, an email provider,
WalletConnect, public testnets) because they are not reachable or not configured from this sandbox.

## Verified in this session (local sandbox, production build)

| Check                                                                                                        | Command                                                                  | Result                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Types                                                                                                        | `pnpm --filter @trestle/web exec tsc --noEmit`                           | 0 errors                                                                                                                            |
| Lint                                                                                                         | `pnpm --filter @trestle/web exec eslint src scripts`                     | clean                                                                                                                               |
| Production build                                                                                             | `pnpm --filter @trestle/web build`                                       | passes                                                                                                                              |
| Unit/contract tests                                                                                          | `pnpm --filter @trestle/web test` · `pnpm --filter @trestle/shared test` | 47/47 · 16/16                                                                                                                       |
| Store browser E2E (card checkout, cancel, register + bag merge, wishlist, admin fulfilment, return + refund) | `pnpm --filter @trestle/web e2e:store` against `next start`              | passed 10/10 consecutive runs after the hydration fix, and every run since                                                          |
| Crypto browser E2E (Add to bag → checkout → stablecoin escrow, cross-chain B→A, gasless confirm → COMPLETED) | `pnpm --filter @trestle/web e2e:ui`                                      | passed (local Anvil chains 31337/31338 + relayer)                                                                                   |
| API crypto E2E (cross-chain, gasless, certificate transfer, dispute, orphan refund)                          | `pnpm --filter @trestle/web e2e:local`                                   | passed                                                                                                                              |
| Responsive smoke + axe                                                                                       | `pnpm --filter @trestle/web smoke`                                       | 42 routes × 390/768/1440 × light/dark; 0 serious/critical axe violations; no broken images or horizontal overflow                   |
| Lighthouse 12 (default mobile emulation, local `next start`)                                                 | `npx lighthouse@12 <url>`                                                | home, /women, a PDP, /bag: accessibility 100, best practices 100, SEO 100; performance 90–96 (LCP 2.5–3.2 s simulated, CLS ≤ 0.073) |
| Contrast tokens                                                                                              | `node apps/web/scripts/check-contrast.mjs`                               | all AA                                                                                                                              |

**Card payments are tested against a LOCAL MOCK of the Stripe API** (`apps/web/test/mock-stripe.ts`); webhook
signatures are real (Stripe SDK). **No real Stripe (test-mode) transaction has been run.**

## Fixed this session

- **Intermittent React hydration error #418 on every page** (about 1 in 3 production E2E runs). Root cause: when the
  RSC chunk for the root layout's `children` arrives after hydration reaches `<main>`, React 19.2 replays `<main>`
  without rewinding its hydration cursor. The root layout now renders children through `<SegmentOutlet>`
  (`src/components/segment-outlet.tsx`). Shared hooks (`useSession`, `useCart`, `useWishlist`) also return
  server-equivalent values while hydrating (`useHydrated` = `useSyncExternalStore`).
- Store E2E sign-up flake: every run registers from 127.0.0.1 and hit the real 5-per-10-minutes limit; the harness now
  clears only the local loopback Redis auth counters.
- Streaming metadata put `<meta name="description">` in `<body>`; `htmlLimitedBots: /.*/` resolves it into `<head>`.
- A cookie-name constant exported from a `"use client"` module was a client reference on the server (grid density).

## What is implemented

- **Catalogue & data**: additive migrations `20260926090000_apparel_card_payments`, `20260926090100_data_api_hardening`
  (RLS on, anon/authenticated revoked), `20260927090000_password_reset`. Colour × size SKUs with stock, image
  colour/credit/licence/dimensions, collections, wishlist, promo codes, returns, contact messages, guest orders.
- **Storefront**: editorial home (hero with entrance choreography, collections, New-in shelf, shoppable denim
  editorial, categories, men's edit, services); Women / Men / Accessories / New in / Collections / Search with
  URL-backed filters and sort; grid density toggle (cookie, server-rendered, view-transition morph); PDP with
  gallery, zoom viewer and hover lens, colour/size matrix, size guide with size finder, accordions, sticky add to bag,
  JSON-LD, related and recently viewed; header mega-menu that hides on scroll down and returns on scroll up;
  predictive search (⌘K or `/`) with recent searches and New-in; bag drawer with free-delivery meter; hover
  quick-add sizes on product cards (touch and keyboard use an accessible size sheet); shared-element view transition
  from card to PDP; scroll-driven reveals and parallax (all motion disabled under `prefers-reduced-motion`).
- **Accounts**: email/password (scrypt), SIWE wallet linking while signed in (never moved between accounts),
  profile, order history, wallet and escrow, loyalty. **Password reset**: hashed single-use tokens that expire,
  anti-enumeration responses, rate limits, all sessions revoked on reset; email via Resend or SMTP (dev/test `log`
  provider is refused in production — email is never faked).
- **Card checkout (hosted Stripe Checkout, test mode)**: exact-cent totals, promo codes, atomic stock reservation;
  the signed, idempotent, row-locked, amount-checked webhook is the only path to PAID; async payments, expiry,
  refunds, oversell auto-refund; guest order links store only a token hash; claim-to-account. Reservations are swept
  lazily and by a daily Vercel cron.
- **Operations**: returns (request → approve → receive/restock → Stripe refund), fulfilment (carrier + tracking →
  delivered), admin (products for any seller, images, variants/stock, orders, partial refunds, returns, messages).
  **Image upload**: JPEG/PNG/WebP/AVIF, real-byte validation, ≥1000 px long edge; Supabase Storage or a local
  `.uploads` folder in development; reorder, alt text and colour tag per image.
- **Crypto**: escrow, disputes, reputation, loyalty, provenance certificates; crypto checkout requires a verified
  wallet; relayer `RELAYER_ONCE=1` single-tick mode.

## NOT done / unverified

1. **Designer imagery (open requirement).** Most products still use the MIT Sylius demo set (960×1280,
   AI-generated resort/beach photography). This does **not** meet the Zara/Prada-level, 1600–2400 px,
   multi-angle requirement. Only Codex's free starter pack (`597f40f`) is integrated: the ivory ribbon-tie blouse (one
   product, one image) and the black-gown studio editorial (hero only, labelled "Editorial · not a product").
   Tailoring, outerwear, knitwear and full dresses/essentials still need free, licensed, high-resolution photographs
   matched to real products (no invented angles), with visual QA. Seed image refs accept `/images/...` paths plus
   `FREE_ASSETS` provenance in `packages/db/seed/catalog.ts`; admins can also upload per product.
2. **Not run against real services**: Stripe test account (real Checkout + webhook delivery), the Supabase project
   (migrations, RLS, Storage bucket), Upstash REST, an email provider (Resend/SMTP), WalletConnect, public
   testnets, Docker.
3. **Continuous crypto relaying is not available on free tiers** (no free always-on worker). Cross-chain intents and
   escrow auto-release progress only when `pnpm --filter @trestle/web relayer:once` is run. The storefront and card
   test checkout do not depend on it.
4. Legal pages (privacy/terms) are marked owner placeholders; size-chart measurements are demo values.

## Free-only deployment

- **Supabase Free** (existing project `aerxltizzvqipaylfglf`; do not create another):
  - `DATABASE_URL` = transaction pooler `:6543` with `?pgbouncer=true&connection_limit=1&schema=trestle&sslmode=require`.
  - `DIRECT_URL` = session pooler `:5432` with `?schema=trestle&sslmode=require`.
  - Run `pnpm --filter @trestle/db migrate:deploy`. Never reset, `db push` or drop.
  - Then `pnpm --filter @trestle/db exec tsx seed.ts --catalog` (catalogue only; no demo users in production).
  - Keep the `trestle` schema out of the Data API exposed schemas.
  - Optional uploads: create a public bucket `product-images`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
    (server-only) and optionally `STORAGE_DRIVER=supabase`, `SUPABASE_STORAGE_BUCKET`.
  - If Prisma rejects the certificate, add the Supabase CA via `sslcert`. Never disable TLS verification.
- **Vercel Hobby** (free, non-commercial) for the app, API and cron. `apps/web/vercel.json` has a daily cron on
  `/api/cron/card-reservations` (set `CRON_SECRET`). Env names: `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `SIWE_SECRET`,
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY` (`sk_test_` only), `STRIPE_WEBHOOK_SECRET`,
  `CRON_SECRET`, `NETWORK_MODE`, `SUPPORT_EMAIL`; password reset needs `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` or
  `EMAIL_PROVIDER=smtp` + `SMTP_URL`, plus `EMAIL_FROM` (free tiers exist; without them the reset endpoint returns 503
  and the UI says so); optional crypto RPC vars in `.env.example`.
- **Upstash Redis Free**: sessions, bag, rate limits.
- **Stripe TEST MODE**: webhook endpoint `https://<app>/api/webhooks/stripe` with `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
  `charge.refunded`.
- **Render: not used.** Background workers have no free plan. The old blueprint is
  `docs/optional/render-relayer-worker.PAID.example.yaml` (reference only).

## Reproduce the local verification

Postgres 16 and Redis on localhost, two Anvil chains (`anvil --port 8545 --chain-id 31337`,
`anvil --port 8546 --chain-id 31338`) with contracts deployed, the relayer (`pnpm --filter @trestle/web relayer:build &&
pnpm --filter @trestle/web relayer:start`), then `pnpm --filter @trestle/web build && pnpm --filter @trestle/web start`
with the mock-Stripe variables described at the top of `apps/web/scripts/store-e2e.ts`, and run the commands in the
table above.
