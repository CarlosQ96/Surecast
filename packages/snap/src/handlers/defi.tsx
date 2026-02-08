import {
  Box,
  Banner,
  Text,
  Button,
  Icon,
  Section,
} from '@metamask/snaps-sdk/jsx';

import { CHAINS, CHAIN_NAMES } from '../data/chains';
import { TOKENS } from '../data/tokens';
import { findVaultToken, PROTOCOL_LABELS } from '../data/vaults';
import type { DefiProtocol } from '../data/vaults';
import type { SnapState, WorkflowStep } from '../types';
import { generateId, chainNameToId } from '../helpers';
import { writeState } from '../state';
import { updateUI } from '../ui';

export async function handleDepositSubmit(
  id: string,
  state: SnapState,
  formValues: Record<string, string>,
) {
  const protocol = (formValues.protocol ?? 'aave-v3') as DefiProtocol;
  const fromChain = chainNameToId(formValues.fromChain ?? 'Ethereum');
  const toChain = chainNameToId(formValues.toChain ?? 'Ethereum');
  const fromSymbol = formValues.fromToken ?? 'ETH';
  const depositAsset = formValues.depositAsset ?? 'USDC';
  const humanAmount = (formValues.amount ?? '').trim();
  const useAll = (formValues.useAllFromPrevious ?? 'No') === 'Yes';

  if (!useAll && (!humanAmount || isNaN(Number(humanAmount)) || Number(humanAmount) <= 0)) {
    await updateUI(id, (
      <Box>
        <Banner title="Invalid Amount" severity="warning">
          <Text>Please enter a valid positive number.</Text>
        </Banner>
        <Button name="step-deposit" variant="primary">
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

  const fromTokenInfo = TOKENS[fromChain]?.[fromSymbol];
  if (!fromTokenInfo) {
    const chainName = CHAIN_NAMES[fromChain as keyof typeof CHAIN_NAMES] ?? 'this chain';
    await updateUI(id, (
      <Box>
        <Banner title="Token Not Found" severity="danger">
          <Text>{`${fromSymbol} is not available on ${chainName}.`}</Text>
        </Banner>
        <Button name="step-deposit" variant="primary">
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

  const vaultToken = findVaultToken(toChain, protocol, depositAsset);
  if (!vaultToken) {
    const protocolLabel = PROTOCOL_LABELS[protocol] ?? protocol;
    const chainName = CHAIN_NAMES[toChain as keyof typeof CHAIN_NAMES] ?? 'this chain';
    await updateUI(id, (
      <Box>
        <Banner title="Vault Not Found" severity="danger">
          <Text>{`${protocolLabel} does not support ${depositAsset} deposits on ${chainName}.`}</Text>
        </Banner>
        <Button name="step-deposit" variant="primary">
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
    type: 'deposit',
    config: {
      protocol,
      fromToken: fromSymbol,
      toToken: vaultToken.symbol,
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

  await writeState(state, { currentWorkflow: updated });

  const protocolLabel = PROTOCOL_LABELS[protocol] ?? protocol;
  const amountLabel = useAll ? 'all from previous step' : `${humanAmount} ${fromSymbol}`;
  await updateUI(id, (
    <Box>
      <Banner title="Step Added" severity="success">
        <Text>{`Deposit ${amountLabel} → ${vaultToken.symbol} (${protocolLabel})`}</Text>
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

export async function handleStakeSubmit(
  id: string,
  state: SnapState,
  formValues: Record<string, string>,
) {
  const protocol = (formValues.protocol ?? 'lido') as DefiProtocol;
  const fromChain = chainNameToId(formValues.fromChain ?? 'Ethereum');
  const fromSymbol = formValues.fromToken ?? 'ETH';
  const humanAmount = (formValues.amount ?? '').trim();
  const useAll = (formValues.useAllFromPrevious ?? 'No') === 'Yes';

  // Staking target is always Ethereum mainnet (Composer bridges cross-chain)
  const toChain = CHAINS.ETHEREUM;

  if (!useAll && (!humanAmount || isNaN(Number(humanAmount)) || Number(humanAmount) <= 0)) {
    await updateUI(id, (
      <Box>
        <Banner title="Invalid Amount" severity="warning">
          <Text>Please enter a valid positive number.</Text>
        </Banner>
        <Button name="step-stake" variant="primary">
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

  const fromTokenInfo = TOKENS[fromChain]?.[fromSymbol];
  if (!fromTokenInfo) {
    const chainName = CHAIN_NAMES[fromChain as keyof typeof CHAIN_NAMES] ?? 'this chain';
    await updateUI(id, (
      <Box>
        <Banner title="Token Not Found" severity="danger">
          <Text>{`${fromSymbol} is not available on ${chainName}.`}</Text>
        </Banner>
        <Button name="step-stake" variant="primary">
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

  // Find the staking receipt token (wstETH or weETH on Ethereum)
  const vaultToken = findVaultToken(toChain, protocol, 'ETH');
  if (!vaultToken) {
    const protocolLabel = PROTOCOL_LABELS[protocol] ?? protocol;
    await updateUI(id, (
      <Box>
        <Banner title="Staking Not Available" severity="danger">
          <Text>{`${protocolLabel} staking is not configured.`}</Text>
        </Banner>
        <Button name="step-stake" variant="primary">
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
    type: 'stake',
    config: {
      protocol,
      fromToken: fromSymbol,
      toToken: vaultToken.symbol,
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

  await writeState(state, { currentWorkflow: updated });

  const protocolLabel = PROTOCOL_LABELS[protocol] ?? protocol;
  const amountLabel = useAll ? 'all from previous step' : `${humanAmount} ${fromSymbol}`;
  const isCrossChain = fromChain !== toChain;
  const crossChainNote = isCrossChain ? ' (cross-chain via LI.FI)' : '';
  await updateUI(id, (
    <Box>
      <Banner title="Step Added" severity="success">
        <Text>{`Stake ${amountLabel} → ${vaultToken.symbol} (${protocolLabel})${crossChainNote}`}</Text>
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
