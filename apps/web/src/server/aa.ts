import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseEventLogs,
  recoverMessageAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@trestle/db";
import { applyChainEvents, fetchTransactionEvents } from "@trestle/db/sync";
import {
  buildPaymasterAndData,
  getUserOpHash,
  packUint128Pair,
  utcDay,
  type PackedUserOperation,
} from "@trestle/shared";
import {
  entryPointAbi,
  simpleAccountAbi,
  simpleAccountFactoryAbi,
  testTokenAbi,
  trestleEscrowAbi,
  trestleLoyaltyAbi,
} from "@trestle/shared/abis";
import type { AAAction } from "@/lib/schemas";
import { env } from "./env";
import { chainProfile, publicClient, requireDeployment } from "./chain";
import { ApiError, badRequest, forbidden, notFound, requireWallet } from "./http";
import { kv } from "./kv";
import { smartAccountFor } from "./accounts";
import type { AuthedUser } from "./session";

/** Anvil account #7 (public dev key) — the default local bundler. Never used outside NETWORK_MODE=local. */
const LOCAL_BUNDLER_KEY =
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356" as const;

const GAS = {
  verificationWithInit: 450_000n,
  verification: 150_000n,
  call: 700_000n,
  preVerification: 80_000n,
  paymasterVerification: 150_000n,
  paymasterPostOp: 80_000n,
};

function bundlerKey(): Hex | null {
  const e = env();
  const k = e.BUNDLER_PRIVATE_KEY ?? e.PAYMASTER_PRIVATE_KEY;
  if (k) return k as Hex;
  return e.mode === "local" ? LOCAL_BUNDLER_KEY : null;
}

export function gaslessAvailable(): boolean {
  return bundlerKey() !== null;
}

interface ResolvedCall {
  chainId: number;
  target: Address;
  value: bigint;
  data: Hex;
  description: string;
  orderId?: string;
}

async function resolveAction(user: AuthedUser, action: AAAction): Promise<ResolvedCall> {
  if (action.action === "confirmDelivery" || action.action === "raiseDispute") {
    const order = await prisma.order.findUnique({ where: { id: action.orderId } });
    if (!order || order.buyerId !== user.id) throw notFound("Order");
    if (!order.escrowChainId || !order.escrowContractOrderId)
      throw badRequest("This order is not in escrow yet");
    const dep = requireDeployment(order.escrowChainId);
    const data =
      action.action === "confirmDelivery"
        ? encodeFunctionData({
            abi: trestleEscrowAbi,
            functionName: "confirmDelivery",
            args: [BigInt(order.escrowContractOrderId)],
          })
        : encodeFunctionData({
            abi: trestleEscrowAbi,
            functionName: "raiseDispute",
            args: [BigInt(order.escrowContractOrderId), action.reason],
          });
    return {
      chainId: order.escrowChainId,
      target: dep.escrow,
      value: 0n,
      data,
      orderId: order.id,
      description:
        action.action === "confirmDelivery"
          ? "Confirm delivery & release escrow"
          : "Raise a dispute",
    };
  }
  const dep = requireDeployment(action.chainId);
  switch (action.action) {
    case "stake":
    case "unstake":
      return {
        chainId: action.chainId,
        target: dep.loyalty,
        value: 0n,
        data: encodeFunctionData({
          abi: trestleLoyaltyAbi,
          functionName: action.action,
          args: [BigInt(action.amount)],
        }),
        description: action.action === "stake" ? "Stake TRST" : "Unstake TRST",
      };
    case "claimRewards":
      return {
        chainId: action.chainId,
        target: dep.loyalty,
        value: 0n,
        data: encodeFunctionData({
          abi: trestleLoyaltyAbi,
          functionName: "claimRewards",
          args: [],
        }),
        description: "Claim staking rewards",
      };
    case "sweep": {
      const owner = getAddress(requireWallet(user));
      const token = getAddress(action.token);
      if (token === zeroAddress) {
        return {
          chainId: action.chainId,
          target: owner,
          value: BigInt(action.amount),
          data: "0x",
          description: "Withdraw ETH to your wallet",
        };
      }
      const allowed = [dep.usdc, dep.dai, dep.loyalty].map((a) => a.toLowerCase());
      if (!allowed.includes(token.toLowerCase()))
        throw badRequest("Only Trestle demo tokens and TRST can be withdrawn gaslessly");
      return {
        chainId: action.chainId,
        target: token,
        value: 0n,
        data: encodeFunctionData({
          abi: testTokenAbi,
          functionName: "transfer",
          args: [owner, BigInt(action.amount)],
        }),
        description: "Withdraw tokens to your wallet",
      };
    }
  }
}

export type SerializedUserOp = Record<keyof PackedUserOperation, string>;

function serializeOp(op: PackedUserOperation): SerializedUserOp {
  return {
    sender: op.sender,
    nonce: op.nonce.toString(),
    initCode: op.initCode,
    callData: op.callData,
    accountGasLimits: op.accountGasLimits,
    preVerificationGas: op.preVerificationGas.toString(),
    gasFees: op.gasFees,
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}

function deserializeOp(o: SerializedUserOp): PackedUserOperation {
  return {
    sender: getAddress(o.sender),
    nonce: BigInt(o.nonce),
    initCode: o.initCode as Hex,
    callData: o.callData as Hex,
    accountGasLimits: o.accountGasLimits as Hex,
    preVerificationGas: BigInt(o.preVerificationGas),
    gasFees: o.gasFees as Hex,
    paymasterAndData: o.paymasterAndData as Hex,
    signature: o.signature as Hex,
  };
}

/** Builds an unsigned, paymaster-sponsored PackedUserOperation for the user's smart account. */
export async function prepareUserOp(user: AuthedUser, action: AAAction) {
  if (!gaslessAvailable())
    throw new ApiError(
      503,
      "gasless_unavailable",
      "Gasless transactions are not configured on this deployment",
    );
  const call = await resolveAction(user, action);
  const dep = requireDeployment(call.chainId);
  const client = publicClient(call.chainId);
  const owner = getAddress(requireWallet(user));
  const sender = await smartAccountFor(user.id, owner, call.chainId);

  if (call.orderId) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: call.orderId } });
    if (order.buyerAccount?.toLowerCase() !== sender.toLowerCase()) {
      throw badRequest(
        "This order's escrow buyer is your wallet, not your smart account — send a normal transaction instead",
      );
    }
  }

  const code = await client.getCode({ address: sender });
  const deployed = !!code && code !== "0x";
  const initCode: Hex = deployed
    ? "0x"
    : concat([
        dep.accountFactory,
        encodeFunctionData({
          abi: simpleAccountFactoryAbi,
          functionName: "createAccount",
          args: [owner, 0n],
        }),
      ]);
  const nonce = (await client.readContract({
    address: dep.entryPoint,
    abi: entryPointAbi,
    functionName: "getNonce",
    args: [sender, 0n],
  })) as bigint;
  const fees = await client.estimateFeesPerGas();
  const maxPriority = fees.maxPriorityFeePerGas ?? 1_000_000n;
  const maxFee = (fees.maxFeePerGas ?? 2_000_000_000n) + maxPriority;

  const op: PackedUserOperation = {
    sender,
    nonce,
    initCode,
    callData: encodeFunctionData({
      abi: simpleAccountAbi,
      functionName: "execute",
      args: [call.target, call.value, call.data],
    }),
    accountGasLimits: packUint128Pair(
      deployed ? GAS.verification : GAS.verificationWithInit,
      GAS.call,
    ),
    preVerificationGas: GAS.preVerification,
    gasFees: packUint128Pair(maxPriority, maxFee),
    paymasterAndData: buildPaymasterAndData(
      dep.paymaster,
      GAS.paymasterVerification,
      GAS.paymasterPostOp,
      utcDay(),
    ),
    signature: "0x",
  };
  const userOpHash = getUserOpHash(op, dep.entryPoint, call.chainId);
  await kv().set(
    `aa:${userOpHash}`,
    JSON.stringify({
      userId: user.id,
      chainId: call.chainId,
      op: serializeOp(op),
      orderId: call.orderId ?? null,
    }),
    { ex: 600 },
  );
  return {
    chainId: call.chainId,
    chainName: chainProfile(call.chainId)?.label,
    sender,
    userOpHash,
    userOp: serializeOp(op),
    description: call.description,
    sponsoredBy: dep.paymaster,
  };
}

function decodeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName) {
      const args = (revert.data.args ?? []).map((a) => (typeof a === "string" ? a : String(a)));
      return `${revert.data.errorName}(${args.join(", ")})`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Verifies the owner's signature and submits the op through EntryPoint.handleOps (self-hosted mini bundler). */
export async function submitUserOp(
  user: AuthedUser,
  input: { chainId: number; userOpHash: Hex; signature: Hex },
) {
  const key = bundlerKey();
  if (!key)
    throw new ApiError(
      503,
      "gasless_unavailable",
      "Gasless transactions are not configured on this deployment",
    );
  // one-shot: consuming the pending op prevents double submission
  const raw = await kv().getdel(`aa:${input.userOpHash}`);
  if (!raw)
    throw new ApiError(
      410,
      "userop_expired",
      "This operation expired or was already submitted — please retry",
    );
  const pending = JSON.parse(raw) as {
    userId: string;
    chainId: number;
    op: SerializedUserOp;
    orderId: string | null;
  };
  if (pending.userId !== user.id || pending.chainId !== input.chainId) throw forbidden();

  const signer = await recoverMessageAddress({
    message: { raw: input.userOpHash },
    signature: input.signature,
  });
  if (signer.toLowerCase() !== requireWallet(user))
    throw forbidden("Signature was not produced by your wallet");

  const dep = requireDeployment(input.chainId);
  const profile = chainProfile(input.chainId)!;
  const client = publicClient(input.chainId);
  const op = { ...deserializeOp(pending.op), signature: input.signature };
  const bundler = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account: bundler,
    chain: profile.chain,
    transport: http(profile.rpcUrl),
  });

  try {
    await client.simulateContract({
      address: dep.entryPoint,
      abi: entryPointAbi,
      functionName: "handleOps",
      args: [[op], bundler.address],
      account: bundler,
    });
  } catch (err) {
    throw new ApiError(
      422,
      "userop_rejected",
      `The sponsored operation would fail: ${decodeRevert(err)}`,
    );
  }
  const txHash = await wallet.writeContract({
    address: dep.entryPoint,
    abi: entryPointAbi,
    functionName: "handleOps",
    args: [[op], bundler.address],
    chain: profile.chain,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
  const opEvents = parseEventLogs({
    abi: entryPointAbi,
    logs: receipt.logs,
    eventName: "UserOperationEvent",
  });
  const mine = opEvents.find(
    (l) =>
      (l.args as { userOpHash: Hex }).userOpHash.toLowerCase() === input.userOpHash.toLowerCase(),
  );
  const success = Boolean(mine && (mine.args as { success: boolean }).success);
  let reason: string | undefined;
  if (!success) {
    const reverts = parseEventLogs({
      abi: entryPointAbi,
      logs: receipt.logs,
      eventName: "UserOperationRevertReason",
    });
    reason = reverts[0]
      ? `Call reverted (${(reverts[0].args as { revertReason: Hex }).revertReason})`
      : "Call reverted";
  }
  const { events } = await fetchTransactionEvents(client, env().mode, input.chainId, txHash);
  await applyChainEvents(prisma, events);
  return {
    txHash,
    chainId: input.chainId,
    success,
    reason,
    actualGasCost: mine ? (mine.args as { actualGasCost: bigint }).actualGasCost.toString() : null,
  };
}
