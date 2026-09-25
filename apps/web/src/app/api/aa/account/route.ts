import { getAddress } from "viem";
import { chainProfiles, deployment, publicClient } from "@/server/chain";
import { smartAccountFor } from "@/server/accounts";
import { gaslessAvailable } from "@/server/aa";
import { route, requireWallet } from "@/server/http";
import { trestlePaymasterAbi } from "@trestle/shared/abis";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const owner = getAddress(requireWallet(user!));
  const accounts = [];
  for (const p of chainProfiles()) {
    const dep = deployment(p.chain.id);
    if (!dep) continue;
    try {
      const address = await smartAccountFor(user!.id, owner, p.chain.id);
      const client = publicClient(p.chain.id);
      const [code, remaining] = await Promise.all([
        client.getCode({ address }),
        client.readContract({
          address: dep.paymaster,
          abi: trestlePaymasterAbi,
          functionName: "remainingToday",
          args: [address],
        }),
      ]);
      accounts.push({
        chainId: p.chain.id,
        chainName: p.label,
        address,
        deployed: !!code && code !== "0x",
        sponsoredGasRemainingWei: (remaining as bigint).toString(),
      });
    } catch {
      accounts.push({
        chainId: p.chain.id,
        chainName: p.label,
        address: null,
        deployed: false,
        sponsoredGasRemainingWei: null,
      });
    }
  }
  return { owner, accounts, gasless: gaslessAvailable() };
});
