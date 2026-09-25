import { concat, encodeAbiParameters, keccak256, pad, toHex, type Address, type Hex } from "viem";

/** ERC-4337 v0.7 PackedUserOperation. */
export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // verificationGasLimit (16) | callGasLimit (16)
  preVerificationGas: bigint;
  gasFees: Hex; // maxPriorityFeePerGas (16) | maxFeePerGas (16)
  paymasterAndData: Hex;
  signature: Hex;
}

export function packUint128Pair(high: bigint, low: bigint): Hex {
  return concat([pad(toHex(high), { size: 16 }), pad(toHex(low), { size: 16 })]);
}

export function buildPaymasterAndData(
  paymaster: Address,
  verificationGas: bigint,
  postOpGas: bigint,
  day: bigint,
): Hex {
  return concat([
    paymaster,
    pad(toHex(verificationGas), { size: 16 }),
    pad(toHex(postOpGas), { size: 16 }),
    pad(toHex(day), { size: 6 }),
  ]);
}

/** userOpHash exactly as EntryPoint v0.7 `getUserOpHash` computes it. */
export function getUserOpHash(op: PackedUserOperation, entryPoint: Address, chainId: number): Hex {
  const packed = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [
      op.sender,
      op.nonce,
      keccak256(op.initCode),
      keccak256(op.callData),
      op.accountGasLimits,
      op.preVerificationGas,
      op.gasFees,
      keccak256(op.paymasterAndData),
    ],
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [keccak256(packed), entryPoint, BigInt(chainId)],
    ),
  );
}

export function utcDay(nowMs = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 1000 / 86_400));
}
