import { trestleAuthenticityAbi } from "@trestle/shared/abis";
import { publicClient, requireDeployment } from "@/server/chain";
import { badRequest, notFound, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Live certificate + full provenance log read directly from the contract. */
export const GET = route<{ chainId: string; tokenId: string }>(
  { rateLimit: { bucket: "cert-read", limit: 120, windowSec: 60 } },
  async ({ params }) => {
    const chainId = Number(params.chainId);
    if (!Number.isInteger(chainId) || !/^\d{1,30}$/.test(params.tokenId)) throw badRequest("Invalid certificate");
    const dep = requireDeployment(chainId);
    const client = publicClient(chainId);
    try {
      const [cert, history, owner] = await Promise.all([
        client.readContract({ address: dep.authenticity, abi: trestleAuthenticityAbi, functionName: "getCertificate", args: [BigInt(params.tokenId)] }),
        client.readContract({ address: dep.authenticity, abi: trestleAuthenticityAbi, functionName: "getHistory", args: [BigInt(params.tokenId)] }),
        client.readContract({ address: dep.authenticity, abi: trestleAuthenticityAbi, functionName: "ownerOf", args: [BigInt(params.tokenId)] }),
      ]);
      return { chainId, contract: dep.authenticity, tokenId: params.tokenId, owner, certificate: cert, history };
    } catch {
      throw notFound("Certificate");
    }
  },
);
