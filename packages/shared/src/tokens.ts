import { zeroAddress, type Address } from "viem";
import { getDeployment } from "./addresses";
import type { NetworkMode } from "./chains";

export type PriceKey = "ETH" | "USD";

export interface TokenInfo {
  chainId: number;
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  isStable: boolean;
  priceKey: PriceKey;
}

export const NATIVE_TOKEN: Address = zeroAddress;

export function getTokens(mode: NetworkMode, chainId: number): TokenInfo[] {
  const dep = getDeployment(mode, chainId);
  const tokens: TokenInfo[] = [
    {
      chainId,
      address: NATIVE_TOKEN,
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      isNative: true,
      isStable: false,
      priceKey: "ETH",
    },
  ];
  if (dep) {
    tokens.push(
      {
        chainId,
        address: dep.usdc,
        symbol: "tUSDC",
        name: "Trestle Test USD Coin",
        decimals: 6,
        isNative: false,
        isStable: true,
        priceKey: "USD",
      },
      {
        chainId,
        address: dep.dai,
        symbol: "tDAI",
        name: "Trestle Test Dai",
        decimals: 18,
        isNative: false,
        isStable: true,
        priceKey: "USD",
      },
    );
  }
  return tokens;
}

export function findToken(
  mode: NetworkMode,
  chainId: number,
  address: string,
): TokenInfo | undefined {
  const a = address.toLowerCase();
  return getTokens(mode, chainId).find((t) => t.address.toLowerCase() === a);
}

export function findTokenBySymbol(
  mode: NetworkMode,
  chainId: number,
  symbol: string,
): TokenInfo | undefined {
  return getTokens(mode, chainId).find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
}

/** Tokens a seller can be paid out in (stablecoins only — product prices are USD-denominated). */
export function payoutTokens(mode: NetworkMode, chainId: number): TokenInfo[] {
  return getTokens(mode, chainId).filter((t) => t.isStable);
}
