import "server-only";
import { getAddress, type Address } from "viem";
import { prisma } from "@trestle/db";
import { simpleAccountFactoryAbi } from "@trestle/shared/abis";
import { publicClient, requireDeployment } from "./chain";

/** Counterfactual ERC-4337 SimpleAccount (salt 0) owned by `owner` on `chainId`; cached in SmartAccount. */
export async function smartAccountFor(
  userId: string,
  owner: Address,
  chainId: number,
): Promise<Address> {
  const cached = await prisma.smartAccount.findUnique({
    where: { userId_chainId: { userId, chainId } },
  });
  const dep = requireDeployment(chainId);
  if (cached && cached.factory === dep.accountFactory.toLowerCase())
    return getAddress(cached.address);
  const address = (await publicClient(chainId).readContract({
    address: dep.accountFactory,
    abi: simpleAccountFactoryAbi,
    functionName: "getAddress",
    args: [getAddress(owner), 0n],
  })) as Address;
  await prisma.smartAccount.upsert({
    where: { userId_chainId: { userId, chainId } },
    create: {
      userId,
      chainId,
      address: address.toLowerCase(),
      factory: dep.accountFactory.toLowerCase(),
    },
    update: { address: address.toLowerCase(), factory: dep.accountFactory.toLowerCase() },
  });
  return address;
}

/** All addresses (EOA + known smart accounts) that belong to a user. */
export async function addressesOf(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { smartAccounts: true },
  });
  if (!user) return [];
  return [user.walletAddress, ...user.smartAccounts.map((s) => s.address)].filter(
    (a): a is string => !!a,
  );
}
