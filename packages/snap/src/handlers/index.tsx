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
import { writeState } from '../state';
import {
  ENS_PUBLIC_RESOLVER,
  ENS_MANIFEST_KEY,
  encodeSetText,
  encodeMulticall,
  serializeWorkflow,
  serializeManifest,
  deserializeManifest,
  readEnsText,
  slugify,
  getWorkflowKey,
} from '../services/ens';
import type { ManifestEntry } from '../services/ens';
import type { SnapState, WorkflowStep } from '../types';
import { generateId, chainNameToId, parseAmount } from '../helpers';
import { renderHome, renderWorkflowList, updateUI } from '../ui';

export async function handleSwapSubmit(
  id: string,
  state: SnapState,
  formValues: Record<string, string>,
) {
  const fromChain = chainNameToId(formValues.fromChain ?? 'Arbitrum');
  const toChain = chainNameToId(formValues.toChain ?? 'Arbitrum');
  const fromSymbol = formValues.fromToken ?? 'ETH';
  const toSymbol = formValues.toToken ?? 'USDC';
  const humanAmount = (formValues.amount ?? '').trim();
  const useAll = (formValues.useAllFromPrevious ?? 'No') === 'Yes';

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

  await writeState(state, { currentWorkflow: updated });

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

    if (workflow.steps.length === 1) {
      await writeState(state, { preparedTx: quote.tx });
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

export async function handleRename(
  id: string,
  state: SnapState,
  formValues: Record<string, string>,
) {
  const newName = (formValues.workflowName ?? '').trim();
  if (!newName) {
    await updateUI(id, renderHome(state));
    return;
  }

  const workflow = state.currentWorkflow;
  if (!workflow) {
    await updateUI(id, renderHome(state));
    return;
  }

  const updated = { ...workflow, name: newName, updatedAt: Date.now() };
  const newState = await writeState(state, { currentWorkflow: updated });
  await updateUI(id, renderHome(newState));
}

export async function handleSaveWorkflow(id: string, state: SnapState) {
  const workflow = state.currentWorkflow;
  if (!workflow || workflow.steps.length === 0) {
    await updateUI(id, (
      <Box>
        <Banner title="Nothing to Save" severity="warning">
          <Text>Add at least one step before saving.</Text>
        </Banner>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
    return;
  }

  const saved = state.savedWorkflows ?? [];
  const existingIndex = saved.findIndex((item) => item.name === workflow.name);

  const copy = {
    ...workflow,
    id: existingIndex >= 0 ? saved[existingIndex]!.id : generateId(),
    updatedAt: Date.now(),
  };

  const updatedSaved = existingIndex >= 0
    ? saved.map((item, index) => (index === existingIndex ? copy : item))
    : [...saved, copy];

  await writeState(state, { savedWorkflows: updatedSaved });
  const action = existingIndex >= 0 ? 'Updated' : 'Saved';

  await updateUI(id, (
    <Box>
      <Banner title={`${action}!`} severity="success">
        <Text>{`${action} "${workflow.name}" (${updatedSaved.length} workflow${updatedSaved.length === 1 ? '' : 's'} saved)`}</Text>
      </Banner>
      <Section>
        <Button name="show-saved">
          <Icon name="menu" size="inherit" />
          {' View My Workflows'}
        </Button>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back to Home'}
        </Button>
      </Section>
    </Box>
  ));
}

export async function handleLoadSavedWorkflow(
  id: string,
  state: SnapState,
  workflowId: string,
) {
  const saved = state.savedWorkflows ?? [];
  const target = saved.find((item) => item.id === workflowId);

  if (!target) {
    await updateUI(id, (
      <Box>
        <Banner title="Not Found" severity="danger">
          <Text>Workflow not found in saved list.</Text>
        </Banner>
        <Button name="show-saved">
          <Icon name="arrow-left" size="inherit" />
          {' Back to List'}
        </Button>
      </Box>
    ));
    return;
  }

  const loaded = {
    ...target,
    id: generateId(),
    updatedAt: Date.now(),
  };

  const newState = await writeState(state, { currentWorkflow: loaded });
  await updateUI(id, renderHome(newState));
}

export async function handleDeleteSavedWorkflow(
  id: string,
  state: SnapState,
  workflowId: string,
) {
  const saved = state.savedWorkflows ?? [];
  const filtered = saved.filter((item) => item.id !== workflowId);
  const newState = await writeState(state, { savedWorkflows: filtered });
  await updateUI(id, renderWorkflowList(newState));
}

export async function handleSaveToEns(id: string, state: SnapState) {
  const workflow = state.currentWorkflow;
  if (!workflow || workflow.steps.length === 0) {
    await updateUI(id, (
      <Box>
        <Banner title="No Steps" severity="warning">
          <Text>Add at least one step before saving to ENS.</Text>
        </Banner>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back'}
        </Button>
      </Box>
    ));
    return;
  }

  // If snap doesn't have the namehash yet, store a save request for the site to complete
  if (!state.userNamehash) {
    await writeState(state, {
      preparedTx: {
        to: ENS_PUBLIC_RESOLVER,
        data: '',
        value: '0x0',
        chainId: 1,
        type: 'ens-save-request',
        description: `Save "${workflow.name}" to ENS`,
      },
    });

    await updateUI(id, (
      <Box>
        <Banner title="ENS Save Queued" severity="success">
          <Text>{`"${workflow.name}" will be saved when you open the Surecast site.`}</Text>
        </Banner>
        <Button name="back-home">
          <Icon name="home" size="inherit" />
          {' Back to Home'}
        </Button>
      </Box>
    ));
    return;
  }

  const workflowSlug = slugify(workflow.name);
  const ensKey = getWorkflowKey(workflowSlug);
  const serialized = serializeWorkflow(workflow);

  // Build setText for the workflow data
  const workflowCall = encodeSetText(state.userNamehash, ensKey, serialized);

  // Read existing manifest from ENS, merge in this workflow
  let manifestEntries: ManifestEntry[] = [];
  try {
    const manifestJson = await readEnsText(state.userNamehash, ENS_MANIFEST_KEY);
    if (manifestJson) {
      manifestEntries = deserializeManifest(manifestJson);
    }
  } catch {
    // start fresh if read fails
  }

  const existingIdx = manifestEntries.findIndex((entry) => entry.slug === workflowSlug);
  if (existingIdx >= 0) {
    manifestEntries[existingIdx] = { slug: workflowSlug, name: workflow.name };
  } else {
    manifestEntries.push({ slug: workflowSlug, name: workflow.name });
  }

  const manifestCall = encodeSetText(
    state.userNamehash,
    ENS_MANIFEST_KEY,
    serializeManifest(manifestEntries),
  );

  // Multicall: batch both setText calls into one transaction
  const multicallData = encodeMulticall([workflowCall, manifestCall]);

  await writeState(state, {
    preparedTx: {
      to: ENS_PUBLIC_RESOLVER,
      data: multicallData,
      value: '0x0',
      chainId: 1,
      type: 'ens-write',
      description: `Save "${workflow.name}" to ENS (${ensKey})`,
    },
  });

  await updateUI(id, (
    <Box>
      <Banner title="ENS Save Prepared" severity="success">
        <Text>{`Ready to save "${workflow.name}" to ${state.userEns ?? 'ENS'}`}</Text>
      </Banner>
      <Text color="muted" size="sm">{`Key: ${ensKey}`}</Text>
      <Text color="muted" size="sm">Open the Surecast site to confirm the transaction.</Text>
      <Button name="back-home">
        <Icon name="home" size="inherit" />
        {' Back to Home'}
      </Button>
    </Box>
  ));
}
