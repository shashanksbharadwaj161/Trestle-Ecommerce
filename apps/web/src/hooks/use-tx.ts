"use client";
import { useCallback, useState } from "react";
import { erc20Abi, type Address, type Hex } from "viem";
import { useConfig } from "wagmi";
import {
  getAccount,
  readContract,
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
  signMessage,
} from "wagmi/actions";
import { api } from "@/lib/api";

export interface TxCall {
  chainId: number;
  to: Address;
  data: Hex;
  value: string;
  description: string;
  requiresAllowance?: { token: Address; owner: Address; spender: Address; amount: string };
}

export type StepStatus =
  "idle" | "switching" | "signing" | "pending" | "syncing" | "done" | "skipped" | "error";
export interface Step {
  description: string;
  chainId: number;
  status: StepStatus;
  hash?: Hex;
  error?: string;
}

/**
 * Executes server-built calls with the connected wallet: switches chain when needed, skips approvals that are
 * already sufficient, waits for each receipt and asks the server to ingest it (/api/chain/sync).
 */
export function useExecuteCalls() {
  const config = useConfig();
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (calls: TxCall[], opts: { onSubmitted?: (hash: Hex, call: TxCall) => void } = {}) => {
      setRunning(true);
      const state: Step[] = calls.map((c) => ({
        description: c.description,
        chainId: c.chainId,
        status: "idle",
      }));
      const update = (i: number, patch: Partial<Step>) => {
        state[i] = { ...state[i]!, ...patch };
        setSteps([...state]);
      };
      setSteps([...state]);
      const hashes: Hex[] = [];
      try {
        for (let i = 0; i < calls.length; i++) {
          const call = calls[i]!;
          if (getAccount(config).chainId !== call.chainId) {
            update(i, { status: "switching" });
            await switchChain(config, { chainId: call.chainId as never });
          }
          if (call.requiresAllowance) {
            const a = call.requiresAllowance;
            const allowance = await readContract(config, {
              address: a.token,
              abi: erc20Abi,
              functionName: "allowance",
              args: [a.owner, a.spender],
              chainId: call.chainId as never,
            });
            if (allowance >= BigInt(a.amount)) {
              update(i, { status: "skipped" });
              continue;
            }
          }
          update(i, { status: "signing" });
          const hash = await sendTransaction(config, {
            to: call.to,
            data: call.data,
            value: BigInt(call.value),
            chainId: call.chainId as never,
          });
          opts.onSubmitted?.(hash, call);
          update(i, { status: "pending", hash });
          const receipt = await waitForTransactionReceipt(config, {
            hash,
            chainId: call.chainId as never,
          });
          if (receipt.status !== "success") throw new Error("Transaction reverted on-chain");
          update(i, { status: "syncing" });
          try {
            await api("/api/chain/sync", { body: { chainId: call.chainId, txHash: hash } });
          } catch {
            /* the relayer indexer will pick it up */
          }
          update(i, { status: "done" });
          hashes.push(hash);
        }
        return hashes;
      } catch (err) {
        const idx = state.findIndex((s) => !["done", "skipped"].includes(s.status));
        if (idx >= 0)
          update(idx, {
            status: "error",
            error: (err as { shortMessage?: string }).shortMessage ?? (err as Error).message,
          });
        throw err;
      } finally {
        setRunning(false);
      }
    },
    [config],
  );

  return { run, steps, running, reset: () => setSteps([]) };
}

export type GaslessAction =
  | { action: "confirmDelivery"; orderId: string }
  | { action: "raiseDispute"; orderId: string; reason: string }
  | { action: "stake" | "unstake"; chainId: number; amount: string }
  | { action: "claimRewards"; chainId: number }
  | { action: "sweep"; chainId: number; token: string; amount: string };

/** ERC-4337 flow: server builds a sponsored UserOperation, the wallet signs its hash (no gas, no chain switch). */
export function useGasless() {
  const config = useConfig();
  const [state, setState] = useState<
    "idle" | "preparing" | "signing" | "bundling" | "done" | "error"
  >("idle");
  const run = useCallback(
    async (action: GaslessAction) => {
      try {
        setState("preparing");
        const prep = await api<{
          chainId: number;
          userOpHash: Hex;
          sender: string;
          description: string;
        }>("/api/aa/prepare", { body: action });
        setState("signing");
        const signature = await signMessage(config, { message: { raw: prep.userOpHash } });
        setState("bundling");
        const res = await api<{ txHash: Hex; success: boolean; reason?: string; chainId: number }>(
          "/api/aa/submit",
          {
            body: { chainId: prep.chainId, userOpHash: prep.userOpHash, signature },
          },
        );
        if (!res.success) throw new Error(res.reason ?? "The sponsored operation reverted");
        setState("done");
        return res;
      } catch (err) {
        setState("error");
        throw err;
      }
    },
    [config],
  );
  return { run, state, busy: state === "preparing" || state === "signing" || state === "bundling" };
}
