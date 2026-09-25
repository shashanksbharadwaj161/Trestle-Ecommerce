import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainProfile, Deployment } from "@trestle/shared";
import {
  testTokenAbi,
  trestleAuthenticityAbi,
  trestleEscrowAbi,
  trestleLoyaltyAbi,
  trestlePaymentRouterAbi,
} from "@trestle/shared/abis";

/** Anvil's PUBLIC default development keys (mnemonic "test test … junk"). Local chains only. */
export const ANVIL_KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  relayer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  chronos: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  sole: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  lumen: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  ava: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  noah: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
} as const satisfies Record<string, Hex>;

export type AnvilRole = keyof typeof ANVIL_KEYS;

export function anvilAddress(role: AnvilRole): Address {
  return privateKeyToAccount(ANVIL_KEYS[role]).address;
}

export class ChainActor {
  readonly public: PublicClient;
  constructor(
    readonly profile: ChainProfile,
    readonly dep: Deployment,
  ) {
    this.public = createPublicClient({
      chain: profile.chain,
      transport: http(profile.rpcUrl),
      pollingInterval: 250,
    }) as PublicClient;
  }

  wallet(role: AnvilRole) {
    return createWalletClient({
      account: privateKeyToAccount(ANVIL_KEYS[role]),
      chain: this.profile.chain,
      transport: http(this.profile.rpcUrl),
      pollingInterval: 250,
    });
  }

  async send(
    role: AnvilRole,
    req: Parameters<ReturnType<ChainActor["wallet"]>["writeContract"]>[0],
  ): Promise<Hex> {
    const hash = await this.wallet(role).writeContract(req as never);
    const receipt = await this.public.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    return hash;
  }

  async mintToken(token: Address, to: Address, amount: bigint) {
    return this.send("deployer", {
      address: token,
      abi: testTokenAbi,
      functionName: "mint",
      args: [to, amount],
    } as never);
  }

  async checkoutDirect(
    buyer: AnvilRole,
    args: {
      orderRef: Hex;
      token: Address;
      escrowAmount: bigint;
      seller: Address;
      buyerAccount: Address;
      window: bigint;
    },
  ) {
    await this.send(buyer, {
      address: args.token,
      abi: testTokenAbi,
      functionName: "approve",
      args: [this.dep.paymentRouter, maxUint256],
    } as never);
    return this.send(buyer, {
      address: this.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName: "checkoutDirect",
      args: [
        args.orderRef,
        args.token,
        args.escrowAmount,
        args.seller,
        args.buyerAccount,
        args.window,
      ],
    } as never);
  }

  async escrowCall(role: AnvilRole, functionName: string, args: readonly unknown[]) {
    return this.send(role, {
      address: this.dep.escrow,
      abi: trestleEscrowAbi,
      functionName,
      args,
    } as never);
  }

  async loyaltyCall(role: AnvilRole, functionName: string, args: readonly unknown[]) {
    return this.send(role, {
      address: this.dep.loyalty,
      abi: trestleLoyaltyAbi,
      functionName,
      args,
    } as never);
  }

  async authenticityCall(role: AnvilRole, functionName: string, args: readonly unknown[]) {
    return this.send(role, {
      address: this.dep.authenticity,
      abi: trestleAuthenticityAbi,
      functionName,
      args,
    } as never);
  }

  async routerCall(
    role: AnvilRole,
    functionName: string,
    args: readonly unknown[],
    value?: bigint,
  ) {
    return this.send(role, {
      address: this.dep.paymentRouter,
      abi: trestlePaymentRouterAbi,
      functionName,
      args,
      value,
    } as never);
  }

  async escrowIdForRef(orderRef: Hex, fromBlock: bigint): Promise<bigint | undefined> {
    const logs = await this.public.getContractEvents({
      address: this.dep.escrow,
      abi: trestleEscrowAbi,
      eventName: "OrderCreated",
      fromBlock,
    });
    const hit = logs.find(
      (l) => (l.args as { ref?: Hex }).ref?.toLowerCase() === orderRef.toLowerCase(),
    );
    return (hit?.args as { orderId?: bigint } | undefined)?.orderId;
  }
}

export async function rpcReachable(profile: ChainProfile): Promise<boolean> {
  try {
    const c = createPublicClient({
      chain: profile.chain,
      transport: http(profile.rpcUrl, { timeout: 2_500, retryCount: 0 }),
    });
    const id = await c.getChainId();
    return id === profile.chain.id;
  } catch {
    return false;
  }
}
