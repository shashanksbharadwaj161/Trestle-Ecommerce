import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import {
  computeRoute,
  getChainProfiles,
  grossUpForFee,
  intentCoversPayout,
  parseUsdToMicros,
  formatUsdMicros,
  formatTokenAmount,
  priceTable,
  usdMicrosToStableAmount,
  type TokenInfo,
  type RouteQuote,
} from "../src";

const [A, B] = getChainProfiles("local");
const usdcB: TokenInfo = {
  chainId: 31338,
  address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  symbol: "tUSDC",
  name: "USDC",
  decimals: 6,
  isNative: false,
  isStable: true,
  priceKey: "USD",
};
const usdcA: TokenInfo = { ...usdcB, chainId: 31337 };
const daiA: TokenInfo = {
  ...usdcA,
  address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  symbol: "tDAI",
  decimals: 18,
};
const ethA: TokenInfo = {
  chainId: 31337,
  address: zeroAddress,
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  isNative: true,
  isStable: false,
  priceKey: "ETH",
};
const prices = priceTable("3000");

describe("money helpers", () => {
  it("parses and formats USD exactly", () => {
    expect(parseUsdToMicros("129.99")).toBe(129_990_000n);
    expect(parseUsdToMicros("0.000001")).toBe(1n);
    expect(() => parseUsdToMicros("1.0000001")).toThrow();
    expect(() => parseUsdToMicros("-1")).toThrow();
    expect(formatUsdMicros(1_234_567_890n)).toBe("$1,234.56");
    expect(formatTokenAmount(1_500_000_000_000_000_000n, 18, 4)).toBe("1.5");
  });

  it("converts stable amounts across decimals", () => {
    expect(usdMicrosToStableAmount(12_340_000n, usdcB)).toBe(12_340_000n);
    expect(usdMicrosToStableAmount(12_340_000n, daiA)).toBe(12_340_000_000_000_000_000n);
  });
});

describe("grossUpForFee", () => {
  it("returns the minimal gross whose net (contract floor fee) covers the target", () => {
    for (const fee of [0n, 1n, 75n, 100n, 333n, 500n]) {
      for (const net of [1n, 99n, 100_000_000n, 123_456_789n, 10n ** 18n + 7n]) {
        const { gross, fee: f } = grossUpForFee(net, fee);
        expect(gross - f).toBeGreaterThanOrEqual(net);
        expect(f).toBe((gross * fee) / 10_000n);
        const smaller = gross - 1n;
        expect(smaller - (smaller * fee) / 10_000n).toBeLessThan(net);
      }
    }
  });
});

describe("computeRoute", () => {
  const base = {
    subtotalUsdMicros: 250_000_000n,
    sourceProfile: A,
    destProfile: B,
    prices,
    effectiveFeeBps: 100n,
    solverSpreadBps: 10n,
  };

  it("quotes a direct same-chain route with the contract's fee formula", () => {
    const q = computeRoute({
      ...base,
      payToken: usdcB,
      payoutToken: usdcB,
      sourceProfile: B,
    }) as RouteQuote;
    expect(q.routeId).toBe("direct-escrow");
    expect(q.destAmount).toBe(250_000_000n);
    expect(q.feeAmount).toBe(2_500_000n);
    expect(q.sourceAmount).toBe(252_500_000n);
  });

  it("rejects same-chain swaps honestly", () => {
    const q = computeRoute({ ...base, payToken: { ...ethA, chainId: 31338 }, payoutToken: usdcB });
    expect(q.routeId).toBe("unavailable");
  });

  it("prices a cross-chain ETH payment so the net covers payout + spread", () => {
    const q = computeRoute({ ...base, payToken: ethA, payoutToken: usdcB }) as RouteQuote;
    expect(q.kind).toBe("cross-chain");
    const check = intentCoversPayout({
      sourceAmount: q.sourceAmount,
      fee: q.feeAmount,
      payToken: ethA,
      destAmount: q.destAmount,
      payoutToken: usdcB,
      prices,
      toleranceBps: 0n,
    });
    expect(check.ok).toBe(true);
    expect(check.netUsd - check.payoutUsd).toBeGreaterThanOrEqual(250_000n); // >= 10 bps spread
  });

  it("stable→stable cross-chain across decimals is exact", () => {
    const q = computeRoute({ ...base, payToken: daiA, payoutToken: usdcB }) as RouteQuote;
    expect(q.destAmount).toBe(250_000_000n);
    expect(q.sourceAmount - q.feeAmount).toBeGreaterThanOrEqual(250_250_000_000_000_000_000n);
  });

  it("relayer rejects an underpaying intent", () => {
    const res = intentCoversPayout({
      sourceAmount: 100_000_000n,
      fee: 1_000_000n,
      payToken: usdcA,
      destAmount: 100_000_000n,
      payoutToken: usdcB,
      prices,
      toleranceBps: 50n,
    });
    expect(res.ok).toBe(false); // net $99.00 < $99.50 minimum
    expect(res.netUsd).toBe(99_000_000n);
  });
});
