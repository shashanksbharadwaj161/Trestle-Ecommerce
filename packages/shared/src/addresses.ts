import type { Address } from "viem";
import type { NetworkMode } from "./chains";
import localJson from "./addresses/addresses.local.json";
import testnetJson from "./addresses/addresses.testnet.json";

export interface Deployment {
  chainId: number;
  deployBlock: number;
  deployer: Address;
  relayer: Address;
  attester: Address;
  arbiter: Address;
  treasury: Address;
  usdc: Address;
  dai: Address;
  escrow: Address;
  reputation: Address;
  loyalty: Address;
  authenticity: Address;
  relayerAdapter: Address;
  paymentRouter: Address;
  entryPoint: Address;
  accountFactory: Address;
  paymaster: Address;
}

interface AddressesFile {
  mode: string;
  generatedAt: string | null;
  chains: Record<string, Deployment>;
}

const files: Record<NetworkMode, AddressesFile> = {
  local: localJson as unknown as AddressesFile,
  testnet: testnetJson as unknown as AddressesFile,
};

export function getDeployments(mode: NetworkMode): Record<number, Deployment> {
  const out: Record<number, Deployment> = {};
  for (const [id, dep] of Object.entries(files[mode].chains)) out[Number(id)] = dep;
  return out;
}

export function getDeployment(mode: NetworkMode, chainId: number): Deployment | undefined {
  return getDeployments(mode)[chainId];
}

export function isDeployed(mode: NetworkMode): boolean {
  return Object.keys(files[mode].chains).length >= 2;
}
