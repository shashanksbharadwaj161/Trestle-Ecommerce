#!/usr/bin/env bash
# Deploys Trestle to both local Anvil chains, wires the routers to each other, provisions solver
# liquidity and writes packages/shared/src/addresses/addresses.local.json.
# The keys below are Anvil's PUBLIC default dev keys — never use them on a real network.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")/.."

RPC_A="${CHAIN_A_RPC_URL:-http://127.0.0.1:8545}"
RPC_B="${CHAIN_B_RPC_URL:-http://127.0.0.1:8546}"
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
RELAYER_PRIVATE_KEY="${RELAYER_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
export RELAYER_ADDRESS="$(cast wallet address --private-key "$RELAYER_PRIVATE_KEY")"
export ATTESTER_ADDRESS="${ATTESTER_ADDRESS:-$RELAYER_ADDRESS}"
# demo sellers = anvil accounts #2, #3, #4
export SELLER_ADDRESSES="${SELLER_ADDRESSES:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,0x90F79bf6EB2c4f870365E785982E1f101E93b906,0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65}"
export PAYMASTER_DEPOSIT_WEI="${PAYMASTER_DEPOSIT_WEI:-10000000000000000000}"
export SOLVER_TOKEN_MINT="${SOLVER_TOKEN_MINT:-1000000}"
LIQUIDITY_USDC="${LIQUIDITY_USDC:-500000000000}"          # 500k tUSDC
LIQUIDITY_DAI="${LIQUIDITY_DAI:-500000000000000000000000}" # 500k tDAI

for rpc in "$RPC_A" "$RPC_B"; do
  cast chain-id --rpc-url "$rpc" >/dev/null || { echo "RPC $rpc not reachable — run 'pnpm chains:up' or 'docker compose up'"; exit 1; }
done

forge build --offline >/dev/null 2>&1 || forge build

deploy() {
  local rpc=$1
  forge script script/Deploy.s.sol:Deploy --rpc-url "$rpc" --broadcast --slow --offline -q
}

echo "==> Deploying to chain A ($RPC_A)"; deploy "$RPC_A"
echo "==> Deploying to chain B ($RPC_B)"; deploy "$RPC_B"

CHAIN_A=$(cast chain-id --rpc-url "$RPC_A")
CHAIN_B=$(cast chain-id --rpc-url "$RPC_B")
DEP=../shared/src/addresses/deployments
addr() { node -p "require('./$DEP/$1.json').$2"; }

bash ./script/wire.sh "$RPC_A" "$CHAIN_A" "$RPC_B" "$CHAIN_B" "$RELAYER_PRIVATE_KEY" "$LIQUIDITY_USDC" "$LIQUIDITY_DAI"

node ./script/merge-addresses.mjs local "$CHAIN_A" "$CHAIN_B"
node ./script/export-abis.mjs
echo "==> Done. Router A: $(addr "$CHAIN_A" paymentRouter)  Router B: $(addr "$CHAIN_B" paymentRouter)"
