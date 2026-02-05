import { CHAINS } from './chains';

export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

export type TokenInfo = {
  address: string;
  symbol: string;
  decimals: number;
};

export const TOKENS: Record<number, Record<string, TokenInfo>> = {
  [CHAINS.ETHEREUM]: {
    ETH: { address: ETH_ADDRESS, symbol: 'ETH', decimals: 18 },
    USDC: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    },
    USDT: {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
    },
    DAI: {
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      decimals: 18,
    },
    WETH: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      symbol: 'WETH',
      decimals: 18,
    },
  },
  [CHAINS.ARBITRUM]: {
    ETH: { address: ETH_ADDRESS, symbol: 'ETH', decimals: 18 },
    USDC: {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      symbol: 'USDC',
      decimals: 6,
    },
    'USDC.e': {
      address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      symbol: 'USDC.e',
      decimals: 6,
    },
    WETH: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      symbol: 'WETH',
      decimals: 18,
    },
  },
  [CHAINS.OPTIMISM]: {
    ETH: { address: ETH_ADDRESS, symbol: 'ETH', decimals: 18 },
    USDC: {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      symbol: 'USDC',
      decimals: 6,
    },
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
    },
  },
  [CHAINS.BASE]: {
    ETH: { address: ETH_ADDRESS, symbol: 'ETH', decimals: 18 },
    USDC: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
    },
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
    },
  },
  [CHAINS.POLYGON]: {
    MATIC: { address: ETH_ADDRESS, symbol: 'MATIC', decimals: 18 },
    USDC: {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      symbol: 'USDC',
      decimals: 6,
    },
    WETH: {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      symbol: 'WETH',
      decimals: 18,
    },
  },
};

export function getTokensForChain(chainId: number): TokenInfo[] {
  const chainTokens = TOKENS[chainId];
  if (!chainTokens) return [];
  return Object.values(chainTokens);
}

export function findToken(
  chainId: number,
  symbolOrAddress: string,
): TokenInfo | undefined {
  const chainTokens = TOKENS[chainId];
  if (!chainTokens) return undefined;

  if (chainTokens[symbolOrAddress]) {
    return chainTokens[symbolOrAddress];
  }

  const lower = symbolOrAddress.toLowerCase();
  return Object.values(chainTokens).find(
    (t) => t.address.toLowerCase() === lower || t.symbol.toLowerCase() === lower,
  );
}
