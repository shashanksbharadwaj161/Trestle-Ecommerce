import type { PriceKey, TokenInfo } from "./tokens";

/** USD price of one whole token, in micro-USD (1e-6 USD). */
export type PriceTable = Record<PriceKey, bigint>;

export const USD_MICROS = 1_000_000n;
export const BPS = 10_000n;

/**
 * DEMO price table. Trestle does NOT use a live oracle in this build: ETH/USD is a configurable constant
 * (PRICE_ETH_USD env var). The same table is used by the quote API and by the relayer when it checks that
 * an intent's source amount covers the seller's payout, so a stale value can only cause quotes to be
 * rejected/refunded — never an underpaid seller.
 */
export function priceTable(ethUsd?: string | number | bigint): PriceTable {
  let eth = 3_000n * USD_MICROS;
  if (ethUsd !== undefined && ethUsd !== "" && ethUsd !== null)
    eth = parseUsdToMicros(String(ethUsd));
  if (eth <= 0n) throw new Error("ETH price must be positive");
  return { ETH: eth, USD: USD_MICROS };
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error("division by non-positive");
  if (a <= 0n) return 0n;
  return (a + b - 1n) / b;
}

export function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** Parses a decimal USD string ("12.34") into micro-USD exactly. Rejects more than 6 decimals. */
export function parseUsdToMicros(value: string): bigint {
  const v = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(v)) throw new Error(`invalid USD amount: ${value}`);
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole!) * USD_MICROS + BigInt(frac.padEnd(6, "0"));
}

export function formatUsdMicros(micros: bigint, opts: { cents?: boolean } = {}): string {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const whole = abs / USD_MICROS;
  const frac = abs % USD_MICROS;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = opts.cents === false ? "" : "." + frac.toString().padStart(6, "0").slice(0, 2);
  return `${neg ? "-" : ""}$${wholeStr}${decimals}`;
}

/** Floor conversion of a token amount into micro-USD. */
export function tokenAmountToUsdMicros(
  amount: bigint,
  token: TokenInfo,
  prices: PriceTable,
): bigint {
  return (amount * prices[token.priceKey]) / pow10(token.decimals);
}

/** Smallest token amount worth at least `usdMicros`. */
export function usdMicrosToTokenAmountCeil(
  usdMicros: bigint,
  token: TokenInfo,
  prices: PriceTable,
): bigint {
  return ceilDiv(usdMicros * pow10(token.decimals), prices[token.priceKey]);
}

/** Exact conversion of USD micros to a stablecoin amount (stablecoins are pegged 1:1 in this demo). */
export function usdMicrosToStableAmount(usdMicros: bigint, token: TokenInfo): bigint {
  if (!token.isStable) throw new Error(`${token.symbol} is not a stablecoin`);
  if (token.decimals >= 6) return usdMicros * pow10(token.decimals - 6);
  return ceilDiv(usdMicros, pow10(6 - token.decimals));
}

/** Formats a raw token amount with at most `maxFraction` decimals (truncating, never rounding up). */
export function formatTokenAmount(amount: bigint, decimals: number, maxFraction = 6): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const base = pow10(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction);
  frac = frac.replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? "." + frac : ""}`;
}
