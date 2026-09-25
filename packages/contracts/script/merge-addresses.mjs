// Merges per-chain deployment files into packages/shared/src/addresses/addresses.<mode>.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , mode, ...chainIds] = process.argv;
if (!mode || chainIds.length === 0) {
  console.error("usage: merge-addresses.mjs <local|testnet> <chainId...>");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "../../shared/src/addresses");
const out = { mode, generatedAt: new Date().toISOString(), chains: {} };
for (const id of chainIds) {
  const file = join(root, "deployments", `${id}.json`);
  if (!existsSync(file)) throw new Error(`missing deployment file ${file}`);
  out.chains[id] = JSON.parse(readFileSync(file, "utf8"));
}
const target = join(root, `addresses.${mode}.json`);
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${target}`);
