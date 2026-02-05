import type { PreparedTransaction } from '../types';

const LIFI_BASE = 'https://li.quest/v1';

type LifiQuoteResponse = {
  action: {
    fromToken: { symbol: string; decimals: number };
    toToken: { symbol: string; decimals: number };
    fromAmount: string;
  };
  estimate: {
    toAmount: string;
    toAmountMin: string;
    gasCosts: { amountUSD: string }[];
    executionDuration: number;
  };
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    chainId: number;
    gasLimit?: string;
  };
};

export type QuoteResult = {
  tx: PreparedTransaction;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  gasUsd: string;
  estimatedSeconds: number;
};

export async function getSwapQuote(
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  fromAddress: string,
  slippage = 0.005,
): Promise<QuoteResult> {
  const url = new URL(`${LIFI_BASE}/quote`);
  url.searchParams.set('fromChain', fromChain.toString());
  url.searchParams.set('toChain', toChain.toString());
  url.searchParams.set('fromToken', fromToken);
  url.searchParams.set('toToken', toToken);
  url.searchParams.set('fromAmount', fromAmount);
  url.searchParams.set('fromAddress', fromAddress);
  url.searchParams.set('slippage', slippage.toString());

  const response = await fetch(url.toString());

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LI.FI quote failed: ${text}`);
  }

  const data = (await response.json()) as LifiQuoteResponse;

  const totalGasUsd = data.estimate.gasCosts.reduce(
    (sum, g) => sum + parseFloat(g.amountUSD || '0'),
    0,
  );

  const tx: PreparedTransaction = {
    to: data.transactionRequest.to,
    data: data.transactionRequest.data,
    value: data.transactionRequest.value || '0x0',
    chainId: fromChain,
    type: 'lifi-swap',
    description: `Swap ${data.action.fromToken.symbol} → ${data.action.toToken.symbol}`,
  };

  // Don't copy gasLimit from LI.FI - let MetaMask estimate gas properly.
  // LI.FI provides inflated gasLimit as safety margin which overpays.

  return {
    tx,
    fromSymbol: data.action.fromToken.symbol,
    toSymbol: data.action.toToken.symbol,
    fromAmount: data.action.fromAmount,
    toAmount: data.estimate.toAmount,
    toAmountMin: data.estimate.toAmountMin,
    gasUsd: totalGasUsd.toFixed(2),
    estimatedSeconds: data.estimate.executionDuration,
  };
}

export function formatTokenAmount(amount: string, decimals: number): string {
  if (!amount || amount === '0') return '0';

  const padded = amount.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals) || '0';
  const fracPart = padded.slice(padded.length - decimals).slice(0, 4);

  const trimmed = fracPart.replace(/0+$/, '');
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}
