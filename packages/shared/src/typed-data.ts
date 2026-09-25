import type { Address, Hex } from "viem";

/** EIP-712 domain used by TrestlePaymentRouter on a given chain. */
export function routerDomain(chainId: number, router: Address) {
  return { name: "TrestlePaymentRouter", version: "1", chainId, verifyingContract: router } as const;
}

export const fulfillMessageTypes = {
  FulfillMessage: [
    { name: "intentId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "sourceChainId", type: "uint256" },
    { name: "sourceRouter", type: "address" },
    { name: "destChainId", type: "uint256" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "destToken", type: "address" },
    { name: "destAmount", type: "uint256" },
    { name: "orderRef", type: "bytes32" },
    { name: "deliveryWindow", type: "uint64" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

export const fulfillmentReceiptTypes = {
  FulfillmentReceipt: [
    { name: "intentId", type: "bytes32" },
    { name: "destChainId", type: "uint256" },
    { name: "destRouter", type: "address" },
    { name: "escrowOrderId", type: "uint256" },
    { name: "solver", type: "address" },
  ],
} as const;

export interface FulfillMessage {
  intentId: Hex;
  nonce: bigint;
  sourceChainId: bigint;
  sourceRouter: Address;
  destChainId: bigint;
  buyer: Address;
  seller: Address;
  destToken: Address;
  destAmount: bigint;
  orderRef: Hex;
  deliveryWindow: bigint;
  expiry: bigint;
}

export interface FulfillmentReceipt {
  intentId: Hex;
  destChainId: bigint;
  destRouter: Address;
  escrowOrderId: bigint;
  solver: Address;
}
