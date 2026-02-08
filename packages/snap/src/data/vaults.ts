import { CHAINS } from './chains';

export type DefiProtocol = 'aave-v3' | 'lido' | 'etherfi';

export type VaultToken = {
  address: string;
  symbol: string;
  decimals: number;
  protocol: DefiProtocol;
  /** The underlying asset the user deposits (e.g. 'ETH', 'USDC') */
  underlyingSymbol: string;
  /** Human-readable label for UI */
  label: string;
};

/**
 * Vault/staking token registry per chain.
 * LI.FI Composer auto-detects these addresses as `toToken` in /v1/quote
 * and composes swap+bridge+deposit/stake into ONE transaction.
 *
 * Aave V3 aToken addresses from: github.com/bgd-labs/aave-address-book
 * Lido/EtherFi addresses from: official deployments
 */
export const VAULT_TOKENS: Record<number, VaultToken[]> = {
  [CHAINS.ETHEREUM]: [
    // Lido
    {
      address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
      symbol: 'wstETH',
      decimals: 18,
      protocol: 'lido',
      underlyingSymbol: 'ETH',
      label: 'Lido wstETH',
    },
    // EtherFi
    {
      address: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
      symbol: 'weETH',
      decimals: 18,
      protocol: 'etherfi',
      underlyingSymbol: 'ETH',
      label: 'EtherFi weETH',
    },
    // Aave V3
    {
      address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
      symbol: 'aWETH',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'ETH',
      label: 'Aave V3 aWETH',
    },
    {
      address: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
      symbol: 'aUSDC',
      decimals: 6,
      protocol: 'aave-v3',
      underlyingSymbol: 'USDC',
      label: 'Aave V3 aUSDC',
    },
    {
      address: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
      symbol: 'aUSDT',
      decimals: 6,
      protocol: 'aave-v3',
      underlyingSymbol: 'USDT',
      label: 'Aave V3 aUSDT',
    },
    {
      address: '0x018008bfb33d285247A21d44E50697654f754e63',
      symbol: 'aDAI',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'DAI',
      label: 'Aave V3 aDAI',
    },
  ],
  [CHAINS.ARBITRUM]: [
    {
      address: '0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8',
      symbol: 'aWETH',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'ETH',
      label: 'Aave V3 aWETH',
    },
    {
      address: '0x724dc807b04555b71ed48a6896b6F41593b8C637',
      symbol: 'aUSDC',
      decimals: 6,
      protocol: 'aave-v3',
      underlyingSymbol: 'USDC',
      label: 'Aave V3 aUSDC',
    },
  ],
  [CHAINS.OPTIMISM]: [
    {
      address: '0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8',
      symbol: 'aWETH',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'ETH',
      label: 'Aave V3 aWETH',
    },
    {
      address: '0x625E7708f30cA75bfd92586e17077590C60eb4cD',
      symbol: 'aUSDC',
      decimals: 6,
      protocol: 'aave-v3',
      underlyingSymbol: 'USDC',
      label: 'Aave V3 aUSDC',
    },
  ],
  [CHAINS.BASE]: [
    {
      address: '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7',
      symbol: 'aWETH',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'ETH',
      label: 'Aave V3 aWETH',
    },
    {
      address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
      symbol: 'aUSDC',
      decimals: 6,
      protocol: 'aave-v3',
      underlyingSymbol: 'USDC',
      label: 'Aave V3 aUSDC',
    },
  ],
  [CHAINS.POLYGON]: [
    {
      address: '0x6d80113e533a2C0fe82EaBD35f1875DcEA89Ea97',
      symbol: 'aWPOL',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'MATIC',
      label: 'Aave V3 aWPOL',
    },
    {
      address: '0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8',
      symbol: 'aWETH',
      decimals: 18,
      protocol: 'aave-v3',
      underlyingSymbol: 'WETH',
      label: 'Aave V3 aWETH',
    },
    {
      address: '0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD',
      symbol: 'aUSDC',
      decimals: 6,
      protocol: 'aave-v3',
      underlyingSymbol: 'USDC',
      label: 'Aave V3 aUSDC',
    },
  ],
};

export function getVaultTokensForChain(chainId: number): VaultToken[] {
  return VAULT_TOKENS[chainId] ?? [];
}

export function getDepositTokens(chainId: number): VaultToken[] {
  return getVaultTokensForChain(chainId).filter(
    (vault) => vault.protocol === 'aave-v3',
  );
}

export function getStakeTokens(chainId: number): VaultToken[] {
  return getVaultTokensForChain(chainId).filter(
    (vault) => vault.protocol === 'lido' || vault.protocol === 'etherfi',
  );
}

export function findVaultToken(
  chainId: number,
  protocol: string,
  underlyingSymbol: string,
): VaultToken | undefined {
  return getVaultTokensForChain(chainId).find(
    (vault) =>
      vault.protocol === protocol &&
      vault.underlyingSymbol === underlyingSymbol,
  );
}

export const PROTOCOL_LABELS: Record<DefiProtocol, string> = {
  'aave-v3': 'Aave V3',
  'lido': 'Lido',
  'etherfi': 'EtherFi',
};

/** Deposit asset options per protocol */
export const DEPOSIT_ASSETS: Record<DefiProtocol, string[]> = {
  'aave-v3': ['ETH', 'USDC', 'USDT', 'DAI'],
  'lido': ['ETH'],
  'etherfi': ['ETH'],
};
