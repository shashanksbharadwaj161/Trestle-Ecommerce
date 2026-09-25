# Trestle — deployment runbook (Vercel + Render + Upstash, Sepolia ↔ Base Sepolia)

This is the exact sequence for taking the repository from "verified locally" to "live on testnets".
Nothing in this repository contains secrets; every value below is supplied in the provider dashboards.

## 0. Wallets and funding

| Wallet                          | Needs                                                                                                                            | Used by                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Deployer**                    | ~0.3 ETH on Sepolia **and** ~0.1 ETH on Base Sepolia (contract deploys + 0.02 ETH paymaster deposit + 0.001 ETH stake per chain) | `pnpm contracts:deploy:testnet`                                      |
| **Relayer / solver / attester** | ~0.05 ETH on each chain for fulfil/settle/fail/auto-release transactions                                                         | Render worker (`RELAYER_PRIVATE_KEY`)                                |
| **Bundler**                     | ~0.05 ETH on each chain (fronts `handleOps` gas; reimbursed by the EntryPoint from the paymaster deposit)                        | Vercel (`BUNDLER_PRIVATE_KEY`)                                       |
| **Admin / arbiter**             | a little ETH on the payout chain(s) to sign `resolveDispute` / `grantRole`                                                       | your browser wallet; pass its address as `ARBITER_ADDRESS` at deploy |

Use four distinct keys in production-like setups. Faucets: Sepolia — https://sepoliafaucet.com,
https://www.alchemy.com/faucets/ethereum-sepolia · Base Sepolia — https://docs.base.org/chain/network-faucets.
RPC: an Alchemy/Infura/QuickNode HTTPS endpoint per chain is strongly recommended (public RPCs rate-limit `eth_getLogs`).

## 1. Deploy contracts to both testnets

```bash
pnpm install
export SEPOLIA_RPC_URL=https://…  BASE_SEPOLIA_RPC_URL=https://…
export DEPLOYER_PRIVATE_KEY=0x…  RELAYER_PRIVATE_KEY=0x…  ARBITER_ADDRESS=0x<admin wallet>
export ETHERSCAN_API_KEY=…            # optional: verifies sources on Etherscan/Basescan
pnpm contracts:deploy:testnet
```

Result: `packages/shared/src/addresses/addresses.testnet.json` (both chains, including `deployBlock`) and refreshed
ABIs. **Commit and push these files** — Vercel and Render read addresses from the repository.

Sanity checks (`cast` from Foundry):

```bash
R=$(node -p "require('./packages/shared/src/addresses/addresses.testnet.json').chains['11155111'].paymentRouter")
cast call $R "remoteRouters(uint256)(address)" 84532 --rpc-url $SEPOLIA_RPC_URL     # → Base Sepolia router
B=$(node -p "require('./packages/shared/src/addresses/addresses.testnet.json').chains['84532']")
```

## 2. Render (Postgres + relayer worker)

1. Dashboard → **New → Blueprint** → select this repository (branch with the committed testnet addresses).
   SUPERSEDED: no Render database or paid worker. Postgres is Supabase; see HANDOFF.md for the free topology.
   Plans in the blueprint (`basic-256mb` DB, `starter` worker) are paid tiers — adjust to your budget.
2. Fill the prompted variables for `trestle-relayer`:
   `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `RELAYER_PRIVATE_KEY`, `ATTESTER_PRIVATE_KEY` (optional),
   `RELAYER_WEBHOOK_URL` = `https://<vercel-domain>/api/webhooks/chain-events`, `RELAYER_WEBHOOK_SECRET` (≥ 32 random chars, same value on Vercel).
3. The worker build runs `prisma migrate deploy` against `trestle-db`, then bundles `apps/web/dist/relayer.mjs`.
   Start command: `pnpm --filter @trestle/web relayer:start`.
4. Copy the database **External Connection String** for Vercel and for seeding.

Deploy order note: the worker posts events to the Vercel webhook. Deploy Vercel first (step 4) or set
`RELAYER_SYNC_MODE=direct` temporarily (the worker then writes to Postgres directly); switch to `webhook` afterwards.

## 3. Upstash

Create a Redis database (any region close to Vercel `iad1`), copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 4. Vercel

1. **Add New → Project** → import the repository. **Root Directory: `apps/web`**. Framework: Next.js.
   `apps/web/vercel.json` runs `pnpm install --frozen-lockfile` (pnpm installs the whole workspace from `apps/web`)
   and `pnpm build` (which generates the Prisma client first). To make Vercel use the exact pnpm version pinned in
   `package.json#packageManager`, add `ENABLE_EXPERIMENTAL_COREPACK=1` to the project env.
2. Environment variables (Production + Preview):

| Name                                                     | Value                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NETWORK_MODE`                                           | `testnet`                                                                    |
| `APP_URL`                                                | `https://<vercel-domain>` (pins the SIWE domain)                             |
| `DATABASE_URL`                                           | Render external connection string (append `?sslmode=require` if not present) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`     | from Upstash                                                                 |
| `SIWE_SECRET`                                            | ≥ 32 random chars                                                            |
| `RELAYER_WEBHOOK_SECRET`                                 | same value as on Render                                                      |
| `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`                | server-side RPCs (may contain API keys)                                      |
| `PUBLIC_CHAIN_A_RPC_URL`, `PUBLIC_CHAIN_B_RPC_URL`       | browser RPCs without secrets (defaults: public endpoints)                    |
| `BUNDLER_PRIVATE_KEY`                                    | bundler key (alias `PAYMASTER_PRIVATE_KEY` accepted)                         |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`                   | optional (enables WalletConnect / mobile wallets)                            |
| `PRICE_ETH_USD`, `PROTOCOL_FEE_BPS`, `SOLVER_SPREAD_BPS` | optional (`3000`, `100`, `10`)                                               |

3. Deploy. Then `curl https://<vercel-domain>/api/health` → `ok: true` with `database`, `kv` (`upstash`),
   `chain_11155111`, `chain_84532` and `contracts` all `ok`.

## 5. Seed production

```bash
export DATABASE_URL='<render external connection string>' NETWORK_MODE=testnet
export SEED_ADMIN_ADDRESS=0x<admin wallet>            # becomes ADMIN in the app
export SEED_SELLER_ADDRESSES=0x…,0x…,0x…               # optional: wallets you control for the 3 demo sellers
pnpm --filter @trestle/db exec tsx seed.ts --network testnet --reset
```

On testnet the seed writes catalog + demo orders **without** chain transactions (flagged "Demo record · not on-chain").
Real on-chain activity comes from actual checkouts.

If you want demo sellers to mint certificates, grant them `SELLER_ROLE` from `/admin/sellers` (admin wallet signs).

## 6. Live verification checklist

- [ ] `/api/health` all green
- [ ] Render logs show `acquired leader lease` and periodic `indexed` lines for both chains
- [ ] Connect a wallet with Sepolia ETH on the live URL, sign in (SIWE)
- [ ] Buy a product sold by a seller paid on Base Sepolia, pay **ETH on Sepolia**
- [ ] Render logs: `intent fulfilled` (Base Sepolia tx) then `intent settled` (Sepolia tx)
- [ ] Order page timeline: Created → Routing → Fulfilled → Settled with explorer links
- [ ] Confirm delivery (gasless) → order Completed; seller tUSDC balance increases on Base Sepolia
- [ ] `/account` shows reputation, `/account/loyalty` shows TRST on Base Sepolia
- [ ] Open + resolve a dispute on a second order from `/admin/disputes`
- [ ] `/admin/transparency` lists the intents with source / fulfilment / settlement transactions
- [ ] Update README → **Live Demo** with the URL and addresses

## Troubleshooting

| Symptom                                                | Cause / fix                                                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote shows cross-chain routes as unavailable          | solver liquidity on the destination chain is below the order amount — deposit more (`wire.sh` does this at deploy; `cast send <router> "depositLiquidity(address,uint256)" …` from the relayer key) |
| Intent refunded with "payment no longer covers payout" | `PRICE_ETH_USD` differs between Vercel and Render, or moved more than `RELAYER_PRICE_TOLERANCE_BPS`                                                                                                 |
| `gasless_unavailable`                                  | `BUNDLER_PRIVATE_KEY` missing on Vercel                                                                                                                                                             |
| `DailyCapExceeded` from the paymaster                  | per-user daily gas cap reached; raise with `setDailyCap` (paymaster owner = deployer)                                                                                                               |
| Relayer `indexing failed … range`                      | lower `RELAYER_MAX_BLOCK_RANGE` (public RPCs often cap `eth_getLogs` ranges)                                                                                                                        |
| Webhook 401                                            | `RELAYER_WEBHOOK_SECRET` mismatch or clock skew > 5 min                                                                                                                                             |
