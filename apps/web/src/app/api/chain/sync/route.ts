import { syncInput } from "@/lib/schemas";
import { syncTransaction } from "@/server/sync";
import { badRequest, parseBody, route } from "@/server/http";
import { supportedChainIds } from "@/server/chain";

/**
 * After a wallet transaction is mined, the client asks the server to ingest it. The server re-reads the receipt
 * from the chain and applies only authentic Trestle contract events (idempotently), so the UI updates immediately
 * instead of waiting for the relayer's next indexing pass.
 */
export const POST = route(
  { auth: "user", rateLimit: { bucket: "chain-sync", limit: 60, windowSec: 60 } },
  async ({ req }) => {
    const { chainId, txHash } = await parseBody(req, syncInput);
    if (!supportedChainIds().includes(chainId)) throw badRequest("Unsupported chain");
    return syncTransaction(chainId, txHash);
  },
);
