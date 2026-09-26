# Trestle — session handoff

Branch `claude/festive-dirac-bk0eb4` (Vercel production, https://trestle-ecommerce-web.vercel.app). Deployed and
verified commit: `0278689` (fixes `fbe790a`, `282953f`, `4e94436`, `0278689` on top of `cc76801`; earlier speed
fixes `cb4930f` … `7e27ceb`; Codex's `f750b3e` Supabase/PostgreSQL-KV work preserved). Constraints in force:
**nothing paid** (free tiers only); **card payments stay disabled** by the user's choice (checkout says so; live Stripe
keys are refused); the crypto testnet deployment/relayer is not configured on production.

## Live verification of `0278689` (real Chromium from this sandbox)

| Check                                                                                                                                                                                                                                                                                                                                                                                                                        | Result                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey audit, **mutating** (`AUDIT_MUTATE=1`): navigation, mega menu, footer, filters/sort/chips/load more/density, rapid navigation, back/forward, search overlay + results, PDP colour/size guide/zoom, add to bag, bag qty +/−/remove + reload persistence, quick add, wishlist, register → account → profile → sign out → sign in, wrong password, admin gate, mobile menu/theme at 768/390, checkout unavailable state | **78/78 passed**. Test data: guest bag emptied again; a `trestle-audit+…@example.test` account created and then **deleted via Profile → Delete account** (final check: it can no longer sign in). No orders, payments or emails. |
| Journey audit, reduced motion (read-only)                                                                                                                                                                                                                                                                                                                                                                                    | 69/69                                                                                                                                                                                                                            |
| Journey audit, Slow-4G (read-only)                                                                                                                                                                                                                                                                                                                                                                                           | 69/69 (slowest step 2.0 s)                                                                                                                                                                                                       |
| Hydration stress, Slow-4G (`scripts/hydration-stress.ts`: density cookie variants, query-string listings, density toggle + reload, rapid navigation, back/forward + reload; 1440 and 390)                                                                                                                                                                                                                                    | 81 page loads, **0 hydration errors**                                                                                                                                                                                            |
| Wallet pages `/seller/onboarding`, `/account/wallet`                                                                                                                                                                                                                                                                                                                                                                         | no HEAD probe, no console errors; Connect modal lists every configured wallet (injected, Coinbase)                                                                                                                               |
| Patched React in the deployed client bundle                                                                                                                                                                                                                                                                                                                                                                                  | backported fix found in `/_next/static/chunks/89df2189-….js`                                                                                                                                                                     |

Live TTFB (curl, two consecutive requests): `/women`, `/men`, `/new`, `/accessories`, `/collections`, PDP, `/bag`,
`/checkout`, `/account`, `/sign-in`, `/search`, `/transparency`, `/seller/onboarding`: 0.33–0.65 s; `/` 1.23 s on the
first request then 0.76 s; `/api/cart` 0.64–0.66 s; `/api/products` 0.48–0.67 s. (Before the speed work these pages
took 6–7 s and intermittently returned 500.)

## What was fixed in this round

1. **Intermittent React #418 under slow networks — root cause fixed.** Reproduced locally (6 errors in 72 Slow-4G
   loads) with an unminified build and React's hydration cursor instrumented: when a grid `<li>`'s `ProductCard`
   client chunk is still downloading, the RSC element is lazy, React suspends inside the host `<ul>` (or the listing
   `<div>`) and replays it; React 19.2 (vendored by Next 15.5.26, the newest 15.5) does not rewind the hydration
   cursor on a host replay, so the `<ul>` claims its own first `<li>`. React 19.3.0 fixed exactly this.
   `patches/next@15.5.26.patch` (pnpm `patchedDependencies`) backports it into Next's vendored react-dom:
   0 errors in 144 local and 81 live Slow-4G loads. `test/react-hydration-patch.test.ts` fails if an upgrade drops
   it — remove the patch once Next ships React ≥ 19.3.
2. **`/transparency` 502** — not reproducible (every later request 200 in ~0.6 s); no code fault found, so it is
   recorded as an unexplained platform incident (Vercel answers 502 when a function crashes or does not respond).
   Hardened anyway: the public aggregate is cached for 15 s (it ran 13 queries per viewer every 8 s), chain reads are
   bounded to 5 s, the page shows "Live figures are temporarily unavailable" + Try again instead of an error page
   (verified with the database stopped), polling is every 30 s, and database outages now answer **503 +
   Retry-After** instead of 500 (`test/http-errors.test.ts`).
3. **Wallet SDK console error** — wagmi's reconnect-on-mount probed every connector, so the Coinbase SDK loaded on
   every crypto page and HEAD-requested the page for its COOP check. Now only browsers that connected a wallet
   before auto-reconnect. Wallet support verified by the crypto browser E2E on fresh local chains (connect, SIWE,
   cross-chain escrow, gasless completion → COMPLETED).
4. **Self-service account deletion** (Profile → Delete account; password-confirmed; refused for accounts with
   orders/payments/returns/reviews/disputes/seller or on-chain history) — also lets the live audit clean up.

## Earlier rounds (still in place)

Seoul function region, pool of 5, Prisma `relationJoins`, cached public catalogue (60 s, invalidated on writes),
schema-qualified raw SQL (fixed intermittent `/api/cart` 500s), links without viewport prefetch (fixed a
navigation race), no click-blocking View Transitions, navigation progress bar, 25 s client request timeout,
diagnostic `ref` on 5xx and `runtime` on `/api/health`.

## Genuine remaining blockers / not verified

- **Admin and seller flows on production** need an admin/seller account; none was provided, and creating one would
  need database access to production — only the anonymous protection was verified live. They pass locally.
- **Card payments**: disabled by request; only the mock-Stripe path is tested locally. No real Stripe test-mode
  transaction has been run.
- **Password-reset email**: not exercised live (would send real email; the provider may be unconfigured — then the
  endpoint answers 503 and the UI says so).
- **Crypto on production**: no testnet contracts/relayer; the crypto flow is verified only on local Anvil chains.
- **Imagery**: most products still use the low-resolution 960×1280 demo set (open requirement).

Reproduce: `BASE_URL=https://trestle-ecommerce-web.vercel.app pnpm --filter @trestle/web exec tsx scripts/journey-audit.ts`
(`AUDIT_SLOW_NETWORK=1`, `AUDIT_REDUCED_MOTION=1`; `AUDIT_MUTATE=1` cleans up after itself) and
`… tsx scripts/hydration-stress.ts`. From this sandbox Chromium needs the proxy CA in its NSS store
(`certutil -A -d sql:$HOME/.pki/nssdb -n ccr-agent-proxy -t "C,," -i /root/.ccr/agent-proxy-ca.crt`); TLS verification
stays on.

## Verified locally (production build)

| Check                                                                                                                                                            | Command                                                                                               | Result                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Types                                                                                                                                                            | `pnpm --filter @trestle/web exec tsc --noEmit`                                                        | 0 errors                                                                                                                            |
| Lint                                                                                                                                                             | `pnpm --filter @trestle/web exec eslint src scripts`                                                  | clean                                                                                                                               |
| Production build                                                                                                                                                 | `pnpm --filter @trestle/web build`                                                                    | passes                                                                                                                              |
| Unit/contract tests                                                                                                                                              | `pnpm --filter @trestle/web test` · `pnpm --filter @trestle/shared test`                              | 61/61 · 16/16                                                                                                                       |
| Store browser E2E (card checkout, cancel, register + bag merge, wishlist, admin fulfilment, return + refund)                                                     | `pnpm --filter @trestle/web e2e:store` against `next start`                                           | passed 10/10 consecutive runs after the hydration fix, and every run since                                                          |
| Crypto browser E2E (Add to bag → checkout → stablecoin escrow, cross-chain B→A, gasless confirm → COMPLETED)                                                     | `pnpm --filter @trestle/web e2e:ui`                                                                   | passed (local Anvil chains 31337/31338 + relayer)                                                                                   |
| API crypto E2E (cross-chain, gasless, certificate transfer, dispute, orphan refund)                                                                              | `pnpm --filter @trestle/web e2e:local`                                                                | passed                                                                                                                              |
| Responsive smoke + axe                                                                                                                                           | `pnpm --filter @trestle/web smoke`                                                                    | 42 routes × 390/768/1440 × light/dark; 0 serious/critical axe violations; no broken images or horizontal overflow                   |
| Lighthouse 12 (default mobile emulation, local `next start`)                                                                                                     | `npx lighthouse@12 <url>`                                                                             | home, /women, a PDP, /bag: accessibility 100, best practices 100, SEO 100; performance 90–96 (LCP 2.5–3.2 s simulated, CLS ≤ 0.073) |
| Journey audit (every nav item, filters/sort/load more/density, search, PDP, bag qty/remove, quick add, wishlist, register/sign-in/out, admin gate; 1440/768/390) | `AUDIT_MUTATE=1 tsx scripts/journey-audit.ts` (also `AUDIT_REDUCED_MOTION=1`, `AUDIT_SLOW_NETWORK=1`) | 78/78 in normal, reduced-motion and Slow-4G modes (local, isolated DB)                                                              |
| Contrast tokens                                                                                                                                                  | `node apps/web/scripts/check-contrast.mjs`                                                            | all AA                                                                                                                              |

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
