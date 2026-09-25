import "server-only";
import { randomBytes } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { ApiError } from "./http";
import { kv } from "./kv";
import { publicClient, supportedChainIds } from "./chain";

export const NONCE_BIND_COOKIE = "trestle_siwe";
export const NONCE_TTL_SECONDS = 300;
const MAX_AGE_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 60_000;

export async function issueNonce(): Promise<{ nonce: string; bind: string }> {
  const nonce = generateSiweNonce();
  const bind = randomBytes(16).toString("hex");
  await kv().set(`siwe:${nonce}`, bind, { ex: NONCE_TTL_SECONDS, nx: true });
  return { nonce, bind };
}

export interface SiweVerification {
  address: `0x${string}`;
  chainId: number;
}

/**
 * Verifies an EIP-4361 message:
 *  - the nonce was issued by us, is bound to this browser (cookie) and is consumed atomically (GETDEL) → no replay
 *  - domain/URI match the request host, chain is supported, issuedAt/expiration/notBefore are sane
 *  - signature is valid for the address (EOA via ecrecover, contract wallets via ERC-1271/6492 on-chain)
 */
export async function verifySiwe(args: {
  message: string;
  signature: Hex;
  host: string;
  bind: string | undefined;
  now?: Date;
}): Promise<SiweVerification> {
  const now = args.now ?? new Date();
  const fail = (msg: string) => new ApiError(401, "siwe_invalid", msg);
  let parsed: ReturnType<typeof parseSiweMessage>;
  try {
    parsed = parseSiweMessage(args.message);
  } catch {
    throw fail("Malformed sign-in message");
  }
  const { address, nonce, domain, chainId, uri, issuedAt, expirationTime, notBefore, version } = parsed;
  if (!address || !isAddress(address) || !nonce || !domain || !chainId || !uri || !issuedAt || version !== "1") {
    throw fail("Sign-in message is missing required fields");
  }
  if (domain !== args.host) throw fail(`Domain mismatch: message is for ${domain}`);
  try {
    if (new URL(uri).host !== args.host) throw fail("URI does not match this site");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw fail("Invalid URI");
  }
  if (!supportedChainIds().includes(chainId)) throw fail(`Chain ${chainId} is not supported`);
  if (issuedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) throw fail("issuedAt is in the future");
  if (now.getTime() - issuedAt.getTime() > MAX_AGE_MS) throw fail("Sign-in message is too old");
  if (expirationTime && expirationTime.getTime() <= now.getTime()) throw fail("Sign-in message expired");
  if (notBefore && notBefore.getTime() > now.getTime() + CLOCK_SKEW_MS) throw fail("Sign-in message not yet valid");

  // one-time nonce, bound to the requesting browser
  const boundTo = await kv().getdel(`siwe:${nonce}`);
  if (!boundTo || !args.bind || boundTo !== args.bind) throw fail("Unknown, expired or already-used nonce");

  const checksummed = getAddress(address);
  let valid = false;
  try {
    valid = await verifyMessage({ address: checksummed, message: args.message, signature: args.signature });
  } catch {
    valid = false;
  }
  if (!valid) {
    // smart-contract wallets (ERC-1271 / ERC-6492) need an on-chain check
    try {
      valid = await publicClient(chainId).verifyMessage({
        address: checksummed,
        message: args.message,
        signature: args.signature,
      });
    } catch {
      valid = false;
    }
  }
  if (!valid) throw fail("Signature does not match the address");
  return { address: checksummed, chainId };
}
