import {
  Box,
  Heading,
  Text,
  Button,
  Divider,
  Section,
  Row,
  Icon,
  Banner,
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
        <Banner title="Invalid Amount" severity="warning">
          <Text>Please enter a valid positive number.</Text>
        </Banner>
        <Button name="step-swap" variant="primary">
          <Icon name="arrow-left" size="inherit" />
          {' Try Again'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
    return;
  }

  // Validate same token on same chain (LI.FI error 1011)
  if (fromChain === toChain && fromSymbol === toSymbol) {
    await updateUI(id, (
      <Box>
        <Banner title="Invalid Swap" severity="danger">
          <Text>Cannot swap a token to itself on the same chain. Choose a different destination token or chain.</Text>
        </Banner>
        <Button name="step-swap" variant="primary">
          <Icon name="arrow-left" size="inherit" />
          {' Try Again'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
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
        <Banner title="Token Not Found" severity="danger">
          <Text>{`${fromSymbol} is not available on ${CHAIN_NAMES[fromChain as keyof typeof CHAIN_NAMES] ?? 'this chain'}.`}</Text>
        </Banner>
        <Button name="step-swap" variant="primary">
          <Icon name="arrow-left" size="inherit" />
          {' Try Again'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
    return;
  }
  if (!toTokenInfo) {
    await updateUI(id, (
      <Box>
        <Banner title="Token Not Found" severity="danger">
          <Text>{`${toSymbol} is not available on ${CHAIN_NAMES[toChain as keyof typeof CHAIN_NAMES] ?? 'this chain'}.`}</Text>
        </Banner>
        <Button name="step-swap" variant="primary">
          <Icon name="arrow-left" size="inherit" />
          {' Try Again'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
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
      <Banner title="Step Added" severity="success">
        <Text>{`Swap ${amountLabel} → ${toSymbol}`}</Text>
      </Banner>
      <Section>
        <Button name="add-step" variant="primary">
          <Icon name="add" size="inherit" />
          {' Add Another Step'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back to Workflow'}
        </Button>
      </Section>
    </Box>
  ));
}

export async function handleGetQuote(id: string, state: SnapState) {
  const workflow = state.currentWorkflow;
  if (!workflow || workflow.steps.length === 0) {
    await updateUI(id, (
      <Box>
        <Banner title="No Steps" severity="warning">
          <Text>Add at least one step before getting a quote.</Text>
        </Banner>
        <Button name="add-step" variant="primary">
          <Icon name="add" size="inherit" />
          {' Add Step'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
    return;
  }

  // Find first quotable step (one with a fixed amount, not chained)
  const firstStep = workflow.steps[0];
  if (!firstStep || firstStep.type !== 'swap') {
    await updateUI(id, (
      <Box>
        <Banner title="Not Supported Yet" severity="warning">
          <Text>Only swap steps can be quoted right now.</Text>
        </Banner>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
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
        <Banner title="Token Error" severity="danger">
          <Text>{`Cannot find ${fromSymbol} on chain ${fromChain}.`}</Text>
        </Banner>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
    return;
  }

  await updateUI(id, (
    <Box>
      <Box direction="horizontal" alignment="space-between">
        <Heading>Fetching Quote</Heading>
        <Icon name="flash" color="primary" />
      </Box>
      <Spinner />
      <Text color="muted">{`Step 1: ${humanAmount} ${fromSymbol} → ${toSymbol}`}</Text>
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
        <Box direction="horizontal" alignment="space-between">
          <Heading>Quote Preview</Heading>
          <Icon name="flash" color="primary" />
        </Box>
        <Divider />
        <Section>
          <Text fontWeight="bold">{`${humanAmount} ${quote.fromSymbol} → ${quote.toSymbol}`}</Text>
          <Row label="Estimated output">
            <Text>{`${estOutput} ${quote.toSymbol}`}</Text>
          </Row>
          <Row label="Minimum output">
            <Text>{`${minOutput} ${quote.toSymbol}`}</Text>
          </Row>
          <Row label="Gas cost">
            <Text>{`~$${quote.gasUsd}`}</Text>
          </Row>
          <Row label="Estimated time">
            <Text>{`~${quote.estimatedSeconds}s`}</Text>
          </Row>
        </Section>
        {isMultiStep ? (
          <Banner title="Multi-step Workflow" severity="info">
            <Text>{`${workflow.steps.length} steps total. Fresh quotes fetched per step during execution.`}</Text>
          </Banner>
        ) : null}
        <Divider />
        <Text color="muted" size="sm">Open the Surecast executor page to run this workflow.</Text>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back to Home'}
        </Button>
      </Box>
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateUI(id, (
      <Box>
        <Banner title="Quote Failed" severity="danger">
          <Text>{msg}</Text>
        </Banner>
        <Button name="get-quote" variant="primary">
          <Icon name="flash" size="inherit" />
          {' Retry'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
  }
}
