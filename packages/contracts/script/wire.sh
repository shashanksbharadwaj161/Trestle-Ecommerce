#!/usr/bin/env bash
# wire.sh RPC_A CHAIN_A RPC_B CHAIN_B RELAYER_PK LIQ_USDC LIQ_DAI
# Registers each router as the other's trusted remote and deposits solver liquidity on both chains.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")/.."
RPC_A=$1; CHAIN_A=$2; RPC_B=$3; CHAIN_B=$4; RELAYER_PK=$5; LIQ_USDC=$6; LIQ_DAI=$7
DEP=../shared/src/addresses/deployments
addr() { node -p "require('./$DEP/$1.json').$2"; }
ROUTER_A=$(addr "$CHAIN_A" paymentRouter); ROUTER_B=$(addr "$CHAIN_B" paymentRouter)

echo "==> Wiring routers A($CHAIN_A) <-> B($CHAIN_B)"
cast send "$ROUTER_A" "setRemoteRouter(uint256,address)" "$CHAIN_B" "$ROUTER_B" --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC_A" >/dev/null
cast send "$ROUTER_B" "setRemoteRouter(uint256,address)" "$CHAIN_A" "$ROUTER_A" --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC_B" >/dev/null

provision() {
  local rpc=$1 chain=$2 router usdc dai
  router=$(addr "$chain" paymentRouter); usdc=$(addr "$chain" usdc); dai=$(addr "$chain" dai)
  echo "==> Solver liquidity on chain $chain"
  cast send "$usdc" "approve(address,uint256)" "$router" "$LIQ_USDC" --private-key "$RELAYER_PK" --rpc-url "$rpc" >/dev/null
  cast send "$router" "depositLiquidity(address,uint256)" "$usdc" "$LIQ_USDC" --private-key "$RELAYER_PK" --rpc-url "$rpc" >/dev/null
  cast send "$dai" "approve(address,uint256)" "$router" "$LIQ_DAI" --private-key "$RELAYER_PK" --rpc-url "$rpc" >/dev/null
  cast send "$router" "depositLiquidity(address,uint256)" "$dai" "$LIQ_DAI" --private-key "$RELAYER_PK" --rpc-url "$rpc" >/dev/null
}
provision "$RPC_A" "$CHAIN_A"
provision "$RPC_B" "$CHAIN_B"
