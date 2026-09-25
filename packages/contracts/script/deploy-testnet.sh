#!/usr/bin/env bash
# Deploys Trestle to Ethereum Sepolia (chain A) and Base Sepolia (chain B).
# Required env: SEPOLIA_RPC_URL, BASE_SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, RELAYER_PRIVATE_KEY
# Optional env: ETHERSCAN_API_KEY (adds --verify), ARBITER_ADDRESS, TREASURY_ADDRESS, ATTESTER_ADDRESS,
#               SELLER_ADDRESSES, PAYMASTER_DEPOSIT_WEI, LIQUIDITY_USDC, LIQUIDITY_DAI
# Both the deployer and the relayer need testnet ETH on BOTH networks (see README → Live Demo → faucets).
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")/.."
: "${SEPOLIA_RPC_URL:?set SEPOLIA_RPC_URL}"
: "${BASE_SEPOLIA_RPC_URL:?set BASE_SEPOLIA_RPC_URL}"
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
: "${RELAYER_PRIVATE_KEY:?set RELAYER_PRIVATE_KEY}"
export DEPLOYER_PRIVATE_KEY
export RELAYER_ADDRESS="$(cast wallet address --private-key "$RELAYER_PRIVATE_KEY")"
export PAYMASTER_DEPOSIT_WEI="${PAYMASTER_DEPOSIT_WEI:-20000000000000000}"   # 0.02 ETH
export PAYMASTER_STAKE_WEI="${PAYMASTER_STAKE_WEI:-1000000000000000}"       # 0.001 ETH
export PAYMASTER_DAILY_CAP_WEI="${PAYMASTER_DAILY_CAP_WEI:-10000000000000000}" # 0.01 ETH / user / day
export SOLVER_TOKEN_MINT="${SOLVER_TOKEN_MINT:-1000000}"
LIQUIDITY_USDC="${LIQUIDITY_USDC:-250000000000}"
LIQUIDITY_DAI="${LIQUIDITY_DAI:-250000000000000000000000}"

VERIFY=()
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then VERIFY=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY"); fi

forge build
for rpc in "$SEPOLIA_RPC_URL" "$BASE_SEPOLIA_RPC_URL"; do
  echo "==> Deploying to $(cast chain-id --rpc-url "$rpc")"
  forge script script/Deploy.s.sol:Deploy --rpc-url "$rpc" --broadcast --slow "${VERIFY[@]}"
done
CHAIN_A=$(cast chain-id --rpc-url "$SEPOLIA_RPC_URL")
CHAIN_B=$(cast chain-id --rpc-url "$BASE_SEPOLIA_RPC_URL")
bash ./script/wire.sh "$SEPOLIA_RPC_URL" "$CHAIN_A" "$BASE_SEPOLIA_RPC_URL" "$CHAIN_B" "$RELAYER_PRIVATE_KEY" "$LIQUIDITY_USDC" "$LIQUIDITY_DAI"
node ./script/merge-addresses.mjs testnet "$CHAIN_A" "$CHAIN_B"
node ./script/export-abis.mjs
echo "==> Commit packages/shared/src/addresses/addresses.testnet.json"
