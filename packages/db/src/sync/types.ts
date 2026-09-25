export type ContractKey = "escrow" | "paymentRouter" | "reputation" | "loyalty" | "authenticity" | "paymaster";

/** A decoded Trestle contract event in a JSON-safe shape (bigints are decimal strings). */
export interface NormalizedEvent {
  chainId: number;
  contract: ContractKey;
  address: string;
  eventName: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  blockTime?: string | null;
  args: Record<string, unknown>;
}

export interface ApplyResult {
  status: "applied" | "duplicate" | "ignored";
  eventName: string;
  note?: string;
}
