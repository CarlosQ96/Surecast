import {
  Box,
  Heading,
  Text,
  Button,
  Divider,
  Spinner,
} from '@metamask/snaps-sdk/jsx';

import { CHAINS, CHAIN_NAMES } from '../data/chains';
import { TOKENS } from '../data/tokens';
import { getSwapQuote, formatTokenAmount } from '../services/lifi';
import { setState } from '../state';
import type { SnapState, WorkflowStep } from '../types';
import { generateId, chainNameToId, parseAmount } from '../helpers';
import { updateUI } from '../ui';

export async function handleSwapSubmit(
  id: string,
  state: SnapState,
) {
  const formState = await snap.request({
    method: 'snap_getInterfaceState',
    params: { id },
  }) as Record<string, Record<string, string | null>>;

  const vals = (formState?.['swap-form'] ?? {}) as Record<string, string | null>;
  const fromChain = chainNameToId(String(vals.fromChain ?? 'Arbitrum'));
  const toChain = chainNameToId(String(vals.toChain ?? 'Arbitrum'));
  const fromSymbol = String(vals.fromToken ?? 'ETH');
  const toSymbol = String(vals.toToken ?? 'USDC');
  const humanAmount = String(vals.amount ?? '').trim();
  const useAll = String(vals.useAllFromPrevious ?? 'No') === 'Yes';

  // Validate amount (skip if chaining from previous step)
  if (!useAll && (!humanAmount || isNaN(Number(humanAmount)) || Number(humanAmount) <= 0)) {
    await updateUI(id, (
      <Box>
        <Heading>Invalid Amount</Heading>
        <Text>Please enter a valid positive number.</Text>
        <Button name="step-swap">Try Again</Button>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  // Validate same token on same chain (LI.FI error 1011)
  if (fromChain === toChain && fromSymbol === toSymbol) {
    await updateUI(id, (
      <Box>
        <Heading>Invalid Swap</Heading>
        <Text>Cannot swap a token to itself on the same chain. Choose a different destination token or chain.</Text>
        <Button name="step-swap">Try Again</Button>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  // Validate tokens exist on selected chains
  const fromTokenInfo = TOKENS[fromChain]?.[fromSymbol];
  const toTokenInfo = TOKENS[toChain]?.[toSymbol];
  if (!fromTokenInfo) {
    await updateUI(id, (
      <Box>
        <Heading>Token Not Found</Heading>
        <Text>{`${fromSymbol} is not available on ${CHAIN_NAMES[fromChain as keyof typeof CHAIN_NAMES] ?? 'this chain'}.`}</Text>
        <Button name="step-swap">Try Again</Button>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }
  if (!toTokenInfo) {
    await updateUI(id, (
      <Box>
        <Heading>Token Not Found</Heading>
        <Text>{`${toSymbol} is not available on ${CHAIN_NAMES[toChain as keyof typeof CHAIN_NAMES] ?? 'this chain'}.`}</Text>
        <Button name="step-swap">Try Again</Button>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  const step: WorkflowStep = {
    id: generateId(),
    type: 'swap',
    config: {
      fromToken: fromSymbol,
      toToken: toSymbol,
      fromChain,
      toChain,
      ...(useAll ? { useAllFromPrevious: true } : { amount: humanAmount }),
    },
  };

  const workflow = state.currentWorkflow ?? {
    id: generateId(),
    name: 'Untitled Workflow',
    steps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const updated = {
    ...workflow,
    steps: [...workflow.steps, step],
    updatedAt: Date.now(),
  };

  await setState({ currentWorkflow: updated });

  const amountLabel = useAll ? 'all from previous step' : `${humanAmount} ${fromSymbol}`;
  await updateUI(id, (
    <Box>
      <Heading>Step Added</Heading>
      <Text>{`Swap ${amountLabel} → ${toSymbol}`}</Text>
      <Divider />
      <Button name="add-step">Add Another Step</Button>
      <Button name="back-home">Back to Workflow</Button>
    </Box>
  ));
}

export async function handleGetQuote(id: string, state: SnapState) {
  const workflow = state.currentWorkflow;
  if (!workflow || workflow.steps.length === 0) {
    await updateUI(id, (
      <Box>
        <Heading>No Steps</Heading>
        <Text>Add at least one step before getting a quote.</Text>
        <Button name="add-step">Add Step</Button>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  // Find first quotable step (one with a fixed amount, not chained)
  const firstStep = workflow.steps[0];
  if (!firstStep || firstStep.type !== 'swap') {
    await updateUI(id, (
      <Box>
        <Heading>Not Supported Yet</Heading>
        <Text>Only swap steps can be quoted right now.</Text>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  const cfg = firstStep.config;
  const fromChain = cfg.fromChain ?? CHAINS.ARBITRUM;
  const toChain = cfg.toChain ?? fromChain;
  const fromSymbol = cfg.fromToken ?? 'ETH';
  const toSymbol = cfg.toToken ?? 'USDC';
  const humanAmount = cfg.amount ?? '0';

  const fromTokenInfo = TOKENS[fromChain]?.[fromSymbol];
  const toTokenInfo = TOKENS[toChain]?.[toSymbol];

  if (!fromTokenInfo) {
    await updateUI(id, (
      <Box>
        <Heading>Token Error</Heading>
        <Text>{`Cannot find ${fromSymbol} on chain ${fromChain}.`}</Text>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  await updateUI(id, (
    <Box>
      <Heading>Fetching Preview Quote...</Heading>
      <Spinner />
      <Text>{`Step 1: ${humanAmount} ${fromSymbol} → ${toSymbol}`}</Text>
    </Box>
  ));

  try {
    const rawAmount = parseAmount(humanAmount, fromTokenInfo.decimals);
    const userAddr = state.userAddress ?? '0x0000000000000000000000000000000000000000';

    const quote = await getSwapQuote(
      fromChain,
      toChain,
      fromTokenInfo.address,
      toTokenInfo?.address ?? toSymbol,
      rawAmount,
      userAddr,
      state.preferences.slippage / 100,
    );

    const estOutput = formatTokenAmount(quote.toAmount, quote.toDecimals);
    const minOutput = formatTokenAmount(quote.toAmountMin, quote.toDecimals);

    // For single-step workflows, also store prepared tx for backward compat
    if (workflow.steps.length === 1) {
      await setState({
        quote: { raw: JSON.stringify(quote) },
        preparedTx: quote.tx,
      });
    }

    const isMultiStep = workflow.steps.length > 1;

    await updateUI(id, (
      <Box>
        <Heading>Quote Preview</Heading>
        <Divider />
        <Text>{`Step 1: ${humanAmount} ${quote.fromSymbol} → ${quote.toSymbol}`}</Text>
        <Text>{`Estimated output: ${estOutput} ${quote.toSymbol}`}</Text>
        <Text>{`Minimum output: ${minOutput} ${quote.toSymbol}`}</Text>
        <Text>{`Gas cost: ~$${quote.gasUsd}`}</Text>
        <Text>{`Estimated time: ~${quote.estimatedSeconds}s`}</Text>
        {isMultiStep && (
          <Box>
            <Divider />
            <Text>{`This workflow has ${workflow.steps.length} steps total.`}</Text>
            <Text>Fresh quotes will be fetched for each step during execution.</Text>
          </Box>
        )}
        <Divider />
        <Text>Open the Surecast executor page to run this workflow.</Text>
        <Button name="back-home">Back to Home</Button>
      </Box>
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateUI(id, (
      <Box>
        <Heading>Quote Failed</Heading>
        <Text>{msg}</Text>
        <Divider />
        <Button name="get-quote">Retry</Button>
        <Button name="back-home">Back</Button>
      </Box>
    ));
  }
}
