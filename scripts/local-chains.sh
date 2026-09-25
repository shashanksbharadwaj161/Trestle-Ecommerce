#!/usr/bin/env bash
# Starts the two local Anvil chains used by Trestle without Docker:
#   Chain A — chainId 31337 on :8545     Chain B — chainId 31338 on :8546
# (docker compose starts the same two nodes; use one or the other, not both.)
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
DIR="$(cd "$(dirname "$0")/.." && pwd)/.local-chains"
mkdir -p "$DIR"
BLOCK_TIME="${ANVIL_BLOCK_TIME:-1}"

start() {
  local name=$1 port=$2 chain=$3
  if curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "http://127.0.0.1:$port" >/dev/null 2>&1; then
    echo "anvil $name already running on :$port"
    return
  fi
  nohup anvil --host 0.0.0.0 --port "$port" --chain-id "$chain" --block-time "$BLOCK_TIME" \
    --accounts 10 --balance 10000 >"$DIR/anvil-$name.log" 2>&1 &
  echo $! >"$DIR/anvil-$name.pid"
  echo "started anvil $name (chainId $chain) on :$port — logs: .local-chains/anvil-$name.log"
}

start a 8545 31337
start b 8546 31338
sleep 1
