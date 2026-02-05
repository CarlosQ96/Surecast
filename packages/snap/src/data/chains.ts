export const CHAINS = {
  ETHEREUM: 1,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  POLYGON: 137,
  BASE: 8453,
} as const;

export type ChainId = (typeof CHAINS)[keyof typeof CHAINS];

export const CHAIN_NAMES: Record<ChainId, string> = {
  [CHAINS.ETHEREUM]: 'Ethereum',
  [CHAINS.ARBITRUM]: 'Arbitrum',
  [CHAINS.OPTIMISM]: 'Optimism',
  [CHAINS.POLYGON]: 'Polygon',
  [CHAINS.BASE]: 'Base',
};
