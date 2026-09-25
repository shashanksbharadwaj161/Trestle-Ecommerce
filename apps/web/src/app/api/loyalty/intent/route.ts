import { z } from "zod";
import { encodeFunctionData } from "viem";
import { trestleLoyaltyAbi } from "@trestle/shared/abis";
import { requireDeployment } from "@/server/chain";
import { badRequest, parseBody, route } from "@/server/http";

const body = z.object({
  chainId: z.coerce.number().int().positive(),
  action: z.enum(["stake", "unstake", "claimRewards"]),
  amount: z
    .string()
    .regex(/^\d{1,40}$/)
    .optional(),
});

/** Builds stake / unstake / claim calldata for the user's own wallet (the gasless path uses /api/aa/prepare). */
export const POST = route(
  { auth: "user", rateLimit: { bucket: "loyalty", limit: 30, windowSec: 60 } },
  async ({ req }) => {
    const input = await parseBody(req, body);
    const dep = requireDeployment(input.chainId);
    if (input.action !== "claimRewards" && (!input.amount || BigInt(input.amount) === 0n))
      throw badRequest("Amount required");
    const data =
      input.action === "claimRewards"
        ? encodeFunctionData({ abi: trestleLoyaltyAbi, functionName: "claimRewards", args: [] })
        : encodeFunctionData({
            abi: trestleLoyaltyAbi,
            functionName: input.action,
            args: [BigInt(input.amount!)],
          });
    return {
      calls: [
        {
          chainId: input.chainId,
          to: dep.loyalty,
          data,
          value: "0",
          description:
            input.action === "stake"
              ? "Stake TRST"
              : input.action === "unstake"
                ? "Unstake TRST"
                : "Claim staking rewards",
        },
      ],
    };
  },
);
