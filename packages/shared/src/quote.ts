import type { ChainProfile } from "./chains";
import {
  BPS,
  ceilDiv,
  tokenAmountToUsdMicros,
  usdMicrosToStableAmount,
  usdMicrosToTokenAmountCeil,
  type PriceTable,
} from "./pricing";
import type { TokenInfo } from "./tokens";

export type RouteKind = "direct" | "cross-chain";

export interface RouteQuote {
  routeId: "direct-escrow" | "attested-relay";
  kind: RouteKind;
  label: string;
  sourceChainId: number;
  destChainId: number;
  payToken: TokenInfo;
  payoutToken: TokenInfo;
  /** exact amount the seller's escrow receives (payout token units) */
  destAmount: bigint;
  /** total the buyer pays (pay token units), protocol fee included */
  sourceAmount: bigint;
  /** protocol fee portion of sourceAmount (pay token units), after loyalty discount */
  feeAmount: bigint;
  /** solver spread priced into sourceAmount (in micro-USD) */
  solverSpreadUsdMicros: bigint;
  effectiveFeeBps: bigint;
  estimatedSeconds: number;
  /** 0-100, higher = fewer trust assumptions */
  securityScore: number;
  securityNotes: string[];
  steps: string[];
}

export interface QuoteUnavailable {
  routeId: "unavailable";
  reason: string;
}

export interface QuoteParams {
  subtotalUsdMicros: bigint;
  payToken: TokenInfo;
  payoutToken: TokenInfo;
  sourceProfile: ChainProfile;
  destProfile: ChainProfile;
  prices: PriceTable;
  /** protocol fee after the buyer's loyalty discount (bps) */
  effectiveFeeBps: bigint;
  /** solver spread for cross-chain fills (bps of payout value) */
  solverSpreadBps: bigint;
  relayPollSeconds?: number;
}

export const SECURITY = {
  direct: {
    score: 96,
    notes: [
      "No bridge or relayer: you pay straight into the escrow contract on the seller's payout chain.",
      "Funds release only on your delivery confirmation, the delivery deadline, or arbitration.",
    ],
  },
  attested: {
    score: 64,
    notes: [
      "Seller escrow is funded from a solver's liquidity that already sits on the destination chain.",
      "The source → destination message is authenticated by a DEMO attestation committee (1-of-1, operated by Trestle). This is a trusted component.",
      "If the intent is not fulfilled before expiry, anyone can refund your payment on the source chain after a 30-minute grace period.",
      "Replay protection: intent ids are unique per (chain, router, nonce) and each can be fulfilled once.",
    ],
  },
} as const;

/** Minimal gross amount S such that S - floor(S * feeBps / 10000) >= net. */
export function grossUpForFee(net: bigint, feeBps: bigint): { gross: bigint; fee: bigint } {
  if (feeBps < 0n || feeBps >= BPS) throw new Error("invalid fee");
  let gross = ceilDiv(net * BPS, BPS - feeBps);
  // floor() in the contract can make the fee one unit smaller than the exact value; walk down safely
  while (gross > 0n && gross - 1n - ((gross - 1n) * feeBps) / BPS >= net) gross -= 1n;
  const fee = (gross * feeBps) / BPS;
  return { gross, fee };
}

export function computeRoute(p: QuoteParams): RouteQuote | QuoteUnavailable {
  if (p.subtotalUsdMicros <= 0n) return { routeId: "unavailable", reason: "Empty order" };
  if (!p.payoutToken.isStable) return { routeId: "unavailable", reason: "Payout token must be a stablecoin" };
  const destAmount = usdMicrosToStableAmount(p.subtotalUsdMicros, p.payoutToken);
  const sameChain = p.payToken.chainId === p.payoutToken.chainId;

  if (sameChain) {
    if (p.payToken.address.toLowerCase() !== p.payoutToken.address.toLowerCase()) {
      return {
        routeId: "unavailable",
        reason: `Same-chain swaps are not supported. Pay with ${p.payoutToken.symbol} on ${p.destProfile.shortName}, or pay from another chain.`,
      };
    }
    const feeAmount = (destAmount * p.effectiveFeeBps) / BPS; // matches TrestlePaymentRouter.quoteDirectFee
    return {
      routeId: "direct-escrow",
      kind: "direct",
      label: `Direct escrow on ${p.destProfile.shortName}`,
      sourceChainId: p.payToken.chainId,
      destChainId: p.payoutToken.chainId,
      payToken: p.payToken,
      payoutToken: p.payoutToken,
      destAmount,
      sourceAmount: destAmount + feeAmount,
      feeAmount,
      solverSpreadUsdMicros: 0n,
      effectiveFeeBps: p.effectiveFeeBps,
      estimatedSeconds: p.destProfile.blockTimeSec * (p.destProfile.confirmations + 1),
      securityScore: SECURITY.direct.score,
      securityNotes: [...SECURITY.direct.notes],
      steps: ["Approve token (if ERC-20)", "Pay into escrow via TrestlePaymentRouter.checkoutDirect", "Escrowed"],
    };
  }

  // cross-chain: the net (post-fee) source value must cover payout + solver spread at the demo prices
  const payoutUsd = tokenAmountToUsdMicros(destAmount, p.payoutToken, p.prices);
  const requiredUsd = ceilDiv(payoutUsd * (BPS + p.solverSpreadBps), BPS);
  const net = usdMicrosToTokenAmountCeil(requiredUsd, p.payToken, p.prices);
  const { gross, fee } = grossUpForFee(net, p.effectiveFeeBps);
  const poll = p.relayPollSeconds ?? 4;
  const est =
    p.sourceProfile.blockTimeSec * (p.sourceProfile.confirmations + 1) + poll + p.destProfile.blockTimeSec * 2;
  return {
    routeId: "attested-relay",
    kind: "cross-chain",
    label: `${p.sourceProfile.shortName} → ${p.destProfile.shortName} via Trestle relay`,
    sourceChainId: p.payToken.chainId,
    destChainId: p.payoutToken.chainId,
    payToken: p.payToken,
    payoutToken: p.payoutToken,
    destAmount,
    sourceAmount: gross,
    feeAmount: fee,
    solverSpreadUsdMicros: requiredUsd - payoutUsd,
    effectiveFeeBps: p.effectiveFeeBps,
    estimatedSeconds: est,
    securityScore: SECURITY.attested.score,
    securityNotes: [...SECURITY.attested.notes],
    steps: [
      "Approve token (if ERC-20)",
      `Lock payment in TrestlePaymentRouter on ${p.sourceProfile.shortName} (IntentCreated)`,
      `Relayer waits ${p.sourceProfile.confirmations} confirmation(s) and attests the intent`,
      `Solver liquidity funds the seller's escrow on ${p.destProfile.shortName} (IntentFulfilled)`,
      "Solver is repaid on the source chain with a fulfilment attestation (IntentSettled)",
    ],
  };
}

/**
 * Relayer-side economic check: does the intent's net source value cover the payout at current demo prices,
 * allowing `toleranceBps` of price movement since the quote?
 */
export function intentCoversPayout(args: {
  sourceAmount: bigint;
  fee: bigint;
  payToken: TokenInfo;
  destAmount: bigint;
  payoutToken: TokenInfo;
  prices: PriceTable;
  toleranceBps: bigint;
}): { ok: boolean; netUsd: bigint; payoutUsd: bigint } {
  const netUsd = tokenAmountToUsdMicros(args.sourceAmount - args.fee, args.payToken, args.prices);
  const payoutUsd = tokenAmountToUsdMicros(args.destAmount, args.payoutToken, args.prices);
  const minUsd = (payoutUsd * (BPS - args.toleranceBps)) / BPS;
  return { ok: netUsd >= minUsd, netUsd, payoutUsd };
}
