# Trestle

**Buy from any chain. Sell without limits.**

Trestle is a cross-chain-native marketplace. Buyers pay with the token they hold on the chain they are on; sellers are
paid in the stablecoin they chose on the chain they chose. Every order sits in an escrow contract until delivery,
certified items carry an ERC-721 authenticity certificate with full on-chain provenance, and buyers and sellers build
soulbound, time-decayed reputation plus a stakeable loyalty token.

> **Demo software.** Local mode runs on two Anvil chains; testnet mode targets Ethereum Sepolia + Base Sepolia.
> tUSDC/tDAI are faucet test tokens. See [Trust model & disclosures](#trust-model--disclosures) before judging any
> security claim.

---

## Contents

- [Architecture](#architecture)
- [How cross-chain settlement works](#how-cross-chain-settlement-works)
- [Trust model & disclosures](#trust-model--disclosures)
- [Local setup](#local-setup)
- [Testing](#testing)
- [Deployment (Vercel + Render)](#deployment-vercel--render)
- [Live Demo](#live-demo)
- [Repository layout](#repository-layout)
- [Design decisions](#design-decisions)

## Architecture

```
                         ┌──────────────────────── Vercel ───────────────────────┐
 Browser (RainbowKit /   │ Next.js 15 app router                                 │
 wagmi / viem, SIWE) ───▶│  • pages (storefront, checkout, account, seller, admin)│
                         │  • /api route handlers (Zod, SIWE sessions, rate limit)│
                         │  • mini ERC-4337 bundler (/api/aa/*)                   │
                         └───────┬───────────────┬──────────────────┬────────────┘
                                 │ Prisma        │ Upstash REST      │ viem (reads, receipts)
                     ┌───────────▼──┐   ┌────────▼───────┐          │
      Render ───────▶│ Postgres     │   │ Redis (Upstash)│          │
                     └───────▲──────┘   └────────────────┘          │
                             │ checkpoints / intents                │
                     ┌───────┴───────────────────────┐   HMAC webhook (events)
      Render ───────▶│ Relayer worker (Node)          │──────────────▶ /api/webhooks/chain-events
                     │ index → attest → fulfil → settle│
                     └──────┬──────────────────┬──────┘
                            ▼                  ▼
                 Chain A (Anvil 31337 /    Chain B (Anvil 31338 /
                 Ethereum Sepolia)          Base Sepolia)
                 Router · Escrow · Rep ·    Router · Escrow · Rep ·
                 Loyalty · Authenticity ·   Loyalty · Authenticity ·
                 Paymaster · EntryPoint     Paymaster · EntryPoint
```

| Layer     | Tech                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin 5.1, `@account-abstraction/contracts` 0.7 (EntryPoint v0.7, SimpleAccount)                                                            |
| App       | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4 with shadcn-style Radix primitives, wagmi 2 + viem + RainbowKit, TanStack Query, Zustand, Framer Motion, Recharts |
| API       | Next.js route handlers, Zod on every boundary, SIWE (EIP-4361) sessions, Redis rate limiting                                                                                 |
| Data      | PostgreSQL + Prisma 6 (money as integer micro-USD / exact `Decimal(78,0)` token units), Redis (Upstash REST or TCP)                                                          |
| Worker    | Node relayer bundled with esbuild, Postgres checkpoints + leader lease                                                                                                       |

### Contracts (`packages/contracts/src`)

| Contract                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TrestleEscrow`             | `createOrder`, router-only `createOrderFor`, `confirmDelivery` (buyer), `autoRelease` (anyone after deadline), `raiseDispute` (buyer/seller, before deadline), `resolveDispute(orderId, buyerShareBps)` (ARBITER_ROLE), `refundBySeller`. ReentrancyGuard on every fund movement, exact-amount token pulls (rejects fee-on-transfer), completion hooks in try/catch so reputation/loyalty can never lock funds. State machine `Created → (Released │ Disputed │ Refunded)`, `Disputed → (Released │ Refunded │ Split)`; buyer confirmation releases atomically, so "Delivered" is an event rather than a resting state. |
| `TrestleAuthenticity`       | ERC-721 certificates, SELLER_ROLE minting, stored manufacturer / batch / original seller / mint time, append-only `getHistory(tokenId)` provenance log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TrestleReputation`         | Soulbound ERC-5192 (transfers/approvals revert via OZ5 `_update` override), one token per account, `recordEvent` only by the escrow (RECORDER_ROLE), `getScore` = half-life-decayed score, dynamic on-chain JSON `tokenURI`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `TrestleLoyalty`            | TRST ERC-20 minted by escrow on completed purchases (5% of order value), `stake` / `unstake` / `claimRewards` with time-based APR, `feeDiscountBps` tiers read by the router, `votingWeight` (stake boosted up to 2× over a year).                                                                                                                                                                                                                                                                                                                                                                                      |
| `TrestlePaymentRouter`      | Intent-based cross-chain settlement (see below) + `checkoutDirect` for same-chain payments; pluggable `IRelayerAdapter`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `AttestationRelayerAdapter` | Demo `IRelayerAdapter`: k-of-n ECDSA attestation committee over an EIP-712 digest.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TrestlePaymaster`          | ERC-4337 v0.7 paymaster: sponsors `SimpleAccount.execute` calls into allow-listed Trestle contracts, per-sender daily cap, ERC-7562-friendly (no `TIMESTAMP` in validation; the UTC day is enforced via `validAfter/validUntil`).                                                                                                                                                                                                                                                                                                                                                                                       |
| `TestToken`                 | Faucet ERC-20 for tUSDC (6 dp) / tDAI (18 dp).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## How cross-chain settlement works

A source-chain transaction cannot move assets to another chain. Trestle uses the **intent / solver** model
(the same shape as ERC-7683 systems):

1. **Quote** – `/api/checkout/quote` prices the order from database prices (never client input) using exact bigint
   math: destination payout in the seller's stablecoin, plus solver spread, grossed up for the router's
   loyalty-discounted protocol fee. It also checks **solver liquidity on the destination chain** and marks routes
   unavailable if it is insufficient.
2. **Initiate** – `/api/checkout/initiate` (idempotent per quote) atomically reserves stock, creates the order and a
   `PaymentIntent`, and returns server-built calldata.
3. **Lock (chain A)** – the buyer calls `TrestlePaymentRouter.createIntent`. Funds are locked; `IntentCreated` is emitted
   with `intentId = keccak256(chainId, router, nonce)`.
4. **Attest & fulfil (chain B)** – after the configured confirmations, the relayer re-reads the intent from chain A,
   validates it field-by-field against the server's quote (token, amounts, seller payout address, buyer account,
   order reference, delivery window) and re-checks the economics, then signs an EIP-712 `FulfillMessage` bound to
   chain B's router domain. `fulfillIntent` verifies the attestation through the adapter, checks the intent id
   derivation, rejects duplicates (`fulfilledIntents`) and expired intents, and funds the seller's escrow **from the
   solver's pre-deposited liquidity on chain B**.
5. **Settle (chain A)** – the relayer signs a `FulfillmentReceipt` bound to chain A's router domain; `settleIntent`
   repays the solver from the locked funds and sends the fee to the treasury.
6. **Failure paths** – invalid, unfundable or orphaned intents are refunded with `failIntent`; if nothing happens,
   anyone can call `refundExpired` after `expiry + 30 min` (the destination refuses fulfilment after `expiry`, so a
   refund and a fulfilment can never both happen).

The relayer indexes every Trestle event on both chains with confirmation depth, stores a **durable checkpoint per
chain in Postgres**, and delivers events to `/api/webhooks/chain-events` (HMAC-SHA256 over timestamp + body, 5-minute
replay window). Application is idempotent (`ChainEvent` unique on `(chainId, txHash, logIndex)`, monotonic order
status transitions), so re-delivery after a crash is harmless. The UI additionally asks `/api/chain/sync` to ingest a
transaction it just mined — the server re-reads the receipt from the RPC, so clients cannot inject events.

## Trust model & disclosures

- **Trusted demo relayer.** The `AttestationRelayerAdapter` is a trusted committee (1-of-1 in the default deployment,
  operated by Trestle; the relayer key doubles as the attester). It is **not** a light client or a decentralised
  bridge. Its power is bounded: it can only fulfil intents that exist on the source chain with the exact signed
  fields, only from its own destination liquidity, once per intent, and buyers can always self-refund after expiry.
  A production deployment swaps the adapter for a light-client/DVN/gateway implementation without touching the router.
- **Simplified account abstraction.** Gasless actions use the real ERC-4337 v0.7 EntryPoint, `SimpleAccount` and the
  Trestle paymaster, but ops are submitted by Trestle's own minimal bundler endpoint (`/api/aa/submit` →
  `EntryPoint.handleOps`) rather than a public bundler/mempool, with fixed gas limits and simulation before submit.
- **Prices** come from a configured demo table (`PRICE_ETH_USD`), not an oracle; the relayer re-validates with a
  tolerance, so stale prices can only cause refunds, never an underpaid seller.
- **Seed data.** In local mode with chains running, every seeded order is a real on-chain transaction. Without chains
  (or on testnet without keys) seeded orders are flagged `isSeedDemo` and shown as "Demo record · not on-chain"; they
  never carry transaction hashes and are excluded from transparency metrics.

## Local setup

Prerequisites: Node ≥ 20.11, pnpm 10, Foundry (`forge`, `anvil`, `cast`), Docker (or local Postgres + Redis).

```bash
pnpm install
docker compose up -d                # Postgres, Redis (+ Upstash-compatible REST facade), Anvil chain A :8545, chain B :8546
                                    #   (no Docker? `pnpm chains:up` starts both Anvil nodes; use a local Postgres/Redis)
cp .env.example apps/web/.env.local # local defaults work as-is; set SIWE_SECRET / RELAYER_WEBHOOK_SECRET to random strings
export DATABASE_URL=postgresql://trestle:trestle@localhost:5432/trestle
pnpm db:migrate                     # prisma migrate dev (use db:migrate:deploy in CI/prod)
pnpm contracts:deploy               # deploys + wires both chains, funds solver liquidity, writes addresses.local.json + ABIs
pnpm seed                           # real on-chain demo orders when the chains are up
pnpm relayer                        # terminal 1 — cross-chain relayer / indexer / keeper
pnpm dev                            # terminal 2 — http://localhost:3000
```

Wallet for the local demo: add the two networks to your wallet (Chain A `http://127.0.0.1:8545`, id 31337;
Chain B `http://127.0.0.1:8546`, id 31338) and import one of the **public Anvil dev keys** printed by `pnpm seed`
(e.g. Noah, buyer, `0x976E…0aa9`; the deployer `0xf39F…2266` is the admin/arbiter; Chronos/Sole/Lumen are sellers).
Never use these keys anywhere else.

Demo path: browse → _Buy now_ → connect & sign in (SIWE) → shipping → choose "ETH on Local A" (cross-chain) → sign →
watch _Created → Routing → Fulfilled → Escrowed_ → open the order → _Confirm delivery_ (gasless, you only sign a message)
→ reputation and TRST update on `/account` and `/account/loyalty`. Open a dispute on another order and resolve it at
`/admin/disputes` with the deployer wallet. Everything shows up on `/admin/transparency`.

## Testing

| Command                                                      | What it covers                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm contracts:test`                                        | Foundry suites for all contracts (happy paths, access control, replay/forgery, reentrancy, fee-on-transfer, fuzzing, real EntryPoint v0.7 flows)                                                                                             |
| `pnpm --filter @trestle/shared test`                         | exact-math quoting / fee gross-up / relayer economics                                                                                                                                                                                        |
| `pnpm --filter @trestle/web test`                            | API route tests against Postgres: SIWE (replay, domain, forgery, chain), authz, CSRF origin checks, rate limits, validation, exact pricing, atomic stock reservation incl. concurrent oversell, quote idempotency, webhook HMAC/replay/dedup |
| `pnpm e2e:local`                                             | full two-chain flow against the running app + relayer (cross-chain checkout, settlement proof, gasless delivery confirmation, gasless staking, dispute + 50/50 arbitration, orphan-intent refund, transparency)                              |
| `pnpm --filter @trestle/web exec tsx scripts/smoke-pages.ts` | Playwright: every route at 1366px and 390px, light and dark, no console errors, no horizontal overflow                                                                                                                                       |

### Verification record (this build)

Executed in the build environment on 2026-09-25 (Node 22, Foundry 1.5.1, solc 0.8.28, Postgres 16, Redis 7, Chromium 1194).
Docker was unavailable in that sandbox, so Postgres/Redis/Anvil ran natively; `docker compose config` was validated
statically.

| Check                                                                                                                       | Result                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Clean-state run: fresh Anvil chains → `contracts:deploy` → fresh DB → `db:migrate:deploy` → `seed` (on-chain)               | ✅ 60 contract events ingested, orders in every status |
| `pnpm contracts:test`                                                                                                       | ✅ 73 / 73 (7 suites, incl. 256-run fuzz test)         |
| `@trestle/shared` tests                                                                                                     | ✅ 8 / 8                                               |
| `@trestle/web` API tests                                                                                                    | ✅ 19 / 19                                             |
| `pnpm typecheck`, `pnpm lint` (ESLint + `forge fmt --check`)                                                                | ✅                                                     |
| `pnpm build` (Next.js production build, 52 routes), `relayer:build`                                                         | ✅                                                     |
| Relayer fulfils + settles the seeded cross-chain intent                                                                     | ✅                                                     |
| `pnpm e2e:local` — direct sync mode                                                                                         | ✅ PASSED                                              |
| `pnpm e2e:local` — **webhook** sync mode (relayer → HMAC → `/api/webhooks/chain-events`), incl. certificate mint + transfer | ✅ PASSED                                              |
| `scripts/ui-e2e.ts` — real browser checkout (RainbowKit + SIWE + cross-chain + gasless confirm)                             | ✅ PASSED (both relayer modes)                         |
| `scripts/smoke-pages.ts` — 16 routes × {1366px, 390px} × {light, dark}                                                      | ✅ 64 / 64                                             |

What the E2E proves on-chain (local Anvil): an ETH payment locked on chain A funds a tUSDC escrow on chain B from
solver liquidity, the solver is repaid on chain A with a signed fulfilment receipt (source intent `Settled`), the
buyer's smart account — holding **0 wei** — confirms delivery through the paymaster, the seller receives the exact
escrowed amount, reputation and TRST are minted, a disputed escrow is split 50/50 by the arbiter with the exact
refund, a non-admin resolve attempt gets 403, and an intent with no Trestle order is refunded by the relayer and never
fulfilled.

**Not executed here** (need external accounts/funds): testnet deployment and the live Vercel/Render/Upstash
verification in [Live Demo](#live-demo); the Upstash REST code path (the TCP-Redis and in-memory KV paths were
exercised; the Upstash adapter is typechecked only); WalletConnect/mobile wallets (no project id); real-wallet
extensions (a scripted EIP-1193 provider backed by Anvil dev accounts stood in for MetaMask).

## Deployment (Vercel + Render)

Step-by-step runbook with funding amounts, env tables, verification checklist and troubleshooting:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

`NETWORK_MODE=testnet` switches every component to Ethereum Sepolia (chain A) and Base Sepolia (chain B) and to
`packages/shared/src/addresses/addresses.testnet.json`.

1. **Contracts** – fund a deployer and a relayer wallet on both testnets (faucets below), then
   ```bash
   export SEPOLIA_RPC_URL=… BASE_SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=… RELAYER_PRIVATE_KEY=… ARBITER_ADDRESS=0x…
   export ETHERSCAN_API_KEY=…   # optional, adds --verify
   pnpm contracts:deploy:testnet
   git add packages/shared/src/addresses/addresses.testnet.json packages/shared/src/abis && git commit -m "Testnet addresses"
   ```
   The script reuses the canonical EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`), wires both
   routers, mints demo tUSDC/tDAI to the relayer and deposits solver liquidity on both chains.
2. **Relayer** – no always-on worker in the free topology; see HANDOFF.md (Render workers are paid; `docs/optional/render-relayer-worker.PAID.example.yaml` is reference only)
   `trestle-relayer` (build runs `prisma migrate deploy` and bundles the worker; start `pnpm --filter @trestle/web
relayer:start`). Fill the `sync: false` variables.
3. **Upstash** – create a Redis database; copy `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
4. **Vercel** – import the repo, root directory `apps/web` (framework Next.js; `vercel.json` installs the pnpm workspace and
   `pnpm build` generates the Prisma client). Set the variables listed below.
5. **Seed** – `NETWORK_MODE=testnet DATABASE_URL=<render external url> pnpm --filter @trestle/db exec tsx seed.ts --network testnet --reset`.
6. **Verify** – `GET /api/health` (DB, KV, both RPCs, addresses), then run a real checkout from Sepolia and watch the
   worker logs (`intent fulfilled`, `intent settled`) and `/admin/transparency`.

Environment variables (names only — never commit values):

| Where          | Variables                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel         | `NETWORK_MODE=testnet`, `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SIWE_SECRET`, `RELAYER_WEBHOOK_SECRET`, `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `PUBLIC_CHAIN_A_RPC_URL`, `PUBLIC_CHAIN_B_RPC_URL`, `BUNDLER_PRIVATE_KEY` (or `PAYMASTER_PRIVATE_KEY`), `APP_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional), `PRICE_ETH_USD`, `PROTOCOL_FEE_BPS`, `SOLVER_SPREAD_BPS` |
| Render worker  | `NETWORK_MODE=testnet`, `DATABASE_URL` (from blueprint), `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `RELAYER_PRIVATE_KEY`, `ATTESTER_PRIVATE_KEY` (optional), `RELAYER_SYNC_MODE=webhook`, `RELAYER_WEBHOOK_URL=https://<vercel-app>/api/webhooks/chain-events`, `RELAYER_WEBHOOK_SECRET`, `PRICE_ETH_USD`                                                                                                       |
| Deploy machine | `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `ARBITER_ADDRESS`, `ETHERSCAN_API_KEY` (optional)                                                                                                                                                                                                                                                                      |

## Live Demo

**Not deployed yet.** This section is filled in after the testnet deployment is performed and verified:

- Live URL: _pending_
- Contract addresses: _pending — see `packages/shared/src/addresses/addresses.testnet.json` once deployed_
- Faucets: Sepolia ETH — https://sepoliafaucet.com, https://www.alchemy.com/faucets/ethereum-sepolia ·
  Base Sepolia ETH — https://docs.base.org/chain/network-faucets · tUSDC/tDAI — call `faucet()` on the token
  contracts (1,000 per day per address).

## Repository layout

```
apps/web                    Next.js app (pages, API routes, relayer worker in src/workers)
packages/contracts          Foundry project (src, test, script/Deploy.s.sol + deploy/wire shell scripts)
packages/db                 Prisma schema, migrations, idempotent chain-event sync, seed.ts
packages/shared             chain profiles, token registry, exact pricing/quote math, EIP-712 types, ABIs, addresses
docker-compose.yml          Postgres, Redis (+ REST facade), two Anvil nodes
docs/optional/              PAID Render worker example (not used; free-only deployment)
```

## Design decisions

- **REST route handlers instead of tRPC.** The spec's API surface is a REST list and webhooks must be REST; shared Zod
  schemas (`apps/web/src/lib/schemas.ts`) give the typed contract without a second RPC layer.
- **Per-seller checkout.** A cart can hold several sellers; each checkout creates one order + one escrow for one seller
  (each seller has its own payout chain/token).
- **Same-chain swaps are not offered.** Paying ETH on the seller's own payout chain would need a DEX; the quote says so
  and offers the direct stablecoin route or a cross-chain route instead.
- **Protocol fee** is charged by the router on the payer's chain and discounted by the payer's TRST stake _on that
  chain_ (loyalty balances are per chain; rewards mint on the escrow chain).
- **Buyer escrow identity.** By default the escrow buyer is the user's counterfactual ERC-4337 smart account on the
  payout chain, so post-purchase actions (confirm, dispute, stake) are gasless and need no chain switch. Users can opt
  for their wallet instead.
- **`DELIVERED`** is an off-chain "carrier reported delivered" state; on-chain delivery confirmation releases funds in
  the same transaction (`COMPLETED`). **`CANCELLED`** was added for reservations that expire unpaid.
- **Leader lease in Postgres** (not Redis) for the relayer so the worker only depends on the database it already needs.
- **Generated artwork** (`/art/[key]`) instead of hot-linked product photos so the demo never depends on third-party images.
- **Prisma 6** (stable `prisma-client-js` generator) rather than the 7.x preview line; `seed.ts` runs with `tsx`.
