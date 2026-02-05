import type {
  OnHomePageHandler,
  OnInstallHandler,
  OnRpcRequestHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';
import {
  Box,
  Heading,
  Text,
  Button,
  Divider,
  Form,
  Field,
  Input,
  Dropdown,
  Option,
  Spinner,
} from '@metamask/snaps-sdk/jsx';

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

import { CHAINS, CHAIN_NAMES } from './data/chains';
import { TOKENS } from './data/tokens';
import { getSwapQuote, formatTokenAmount } from './services/lifi';
import { getState, setState } from './state';
import type { SnapState, WorkflowStep } from './types';

function renderHome(state: SnapState) {
  const workflow = state.currentWorkflow;
  const steps = workflow?.steps ?? [];

  return (
    <Box>
      <Heading>Surecast</Heading>
      <Text>DeFi workflow composer</Text>
      <Divider />
      {workflow ? (
        <Box>
          <Text>{`Workflow: ${workflow.name}`}</Text>
          {steps.length === 0 && <Text>No steps yet. Add one below.</Text>}
          {steps.map((s, i) => (
            <Text>{`${i + 1}. ${s.type} — ${s.config.fromToken ?? '?'} → ${s.config.toToken ?? '?'} (${s.config.amount ?? '?'})`}</Text>
          ))}
        </Box>
      ) : (
        <Text>No workflow loaded. Start by adding a step.</Text>
      )}
      <Divider />
      <Button name="add-step">Add Step</Button>
      {steps.length > 0 && <Button name="get-quote">Get Quote</Button>}
      {(state.workflows?.length ?? 0) > 0 && (
        <Button name="load-workflow">Load Saved</Button>
      )}
    </Box>
  );
}

function renderSwapForm() {
  const chainEntries = Object.entries(CHAIN_NAMES);
  const defaultTokens = TOKENS[CHAINS.ARBITRUM];
  const tokenKeys = defaultTokens ? Object.keys(defaultTokens) : [];

  return (
    <Box>
      <Heading>Add Swap Step</Heading>
      <Text>Configure a token swap</Text>
      <Divider />
      <Form name="swap-form">
        <Field label="From Chain">
          <Dropdown name="fromChain">
            {chainEntries.map(([, name]) => (
              <Option value={name}>{name}</Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="To Chain">
          <Dropdown name="toChain">
            {chainEntries.map(([, name]) => (
              <Option value={name}>{name}</Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="From Token">
          <Dropdown name="fromToken" value="ETH">
            {tokenKeys.map((sym) => (
              <Option value={sym}>{sym}</Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="To Token">
          <Dropdown name="toToken" value="USDC">
            {tokenKeys.map((sym) => (
              <Option value={sym}>{sym}</Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Amount (e.g. 10)">
          <Input name="amount" placeholder="10" />
        </Field>
        <Button name="submit-swap">Add to Workflow</Button>
      </Form>
      <Divider />
      <Button name="back-home">Cancel</Button>
    </Box>
  );
}

function chainNameToId(name: string): number {
  const entry = Object.entries(CHAIN_NAMES).find(([, n]) => n === name);
  return entry ? Number(entry[0]) : CHAINS.ARBITRUM;
}

function parseAmount(human: string, decimals: number): string {
  const parts = human.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
  return `${intPart}${fracPart}`.replace(/^0+/, '') || '0';
}

async function updateUI(
  id: string,
  ui: ReturnType<typeof renderHome>,
) {
  await snap.request({
    method: 'snap_updateInterface',
    params: { id, ui },
  });
}

async function handleSwapSubmit(
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

  // Validate amount
  if (!humanAmount || isNaN(Number(humanAmount)) || Number(humanAmount) <= 0) {
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
      amount: humanAmount,
      fromChain,
      toChain,
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

  const freshState = await getState();
  await updateUI(id, (
    <Box>
      <Heading>Step Added</Heading>
      <Text>{`Swap ${humanAmount} ${fromSymbol} → ${toSymbol}`}</Text>
      <Divider />
      <Button name="add-step">Add Another Step</Button>
      <Button name="back-home">Back to Workflow</Button>
    </Box>
  ));
}

async function handleGetQuote(id: string, state: SnapState) {
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

  const lastStep = workflow.steps[workflow.steps.length - 1];
  if (!lastStep || lastStep.type !== 'swap') {
    await updateUI(id, (
      <Box>
        <Heading>Not Supported Yet</Heading>
        <Text>Only swap steps can be quoted right now.</Text>
        <Button name="back-home">Back</Button>
      </Box>
    ));
    return;
  }

  const cfg = lastStep.config;
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
      <Heading>Fetching Quote...</Heading>
      <Spinner />
      <Text>{`${humanAmount} ${fromSymbol} → ${toSymbol}`}</Text>
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

    const toDecimals = toTokenInfo?.decimals ?? 18;
    const estOutput = formatTokenAmount(quote.toAmount, toDecimals);
    const minOutput = formatTokenAmount(quote.toAmountMin, toDecimals);

    await setState({
      quote: { raw: JSON.stringify(quote) },
      preparedTx: quote.tx,
    });

    await updateUI(id, (
      <Box>
        <Heading>Quote Ready</Heading>
        <Divider />
        <Text>{`Swap: ${humanAmount} ${quote.fromSymbol} → ${quote.toSymbol}`}</Text>
        <Text>{`Estimated output: ${estOutput} ${quote.toSymbol}`}</Text>
        <Text>{`Minimum output: ${minOutput} ${quote.toSymbol}`}</Text>
        <Text>{`Gas cost: ~$${quote.gasUsd}`}</Text>
        <Text>{`Estimated time: ~${quote.estimatedSeconds}s`}</Text>
        <Divider />
        <Text>Open the Surecast executor page to send this transaction.</Text>
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

export const onHomePage: OnHomePageHandler = async () => {
  const state = await getState();
  const interfaceId = await snap.request({
    method: 'snap_createInterface',
    params: { ui: renderHome(state) },
  });
  return { id: interfaceId };
};

export const onUserInput: OnUserInputHandler = async ({ id, event }) => {
  try {
    const state = await getState();

    if (event.type !== UserInputEventType.ButtonClickEvent) {
      return;
    }

    switch (event.name) {
      case 'submit-swap': {
        await handleSwapSubmit(id, state);
        return;
      }

      case 'add-step': {
        await updateUI(id, (
          <Box>
            <Heading>Add Step</Heading>
            <Text>Choose an action for this step:</Text>
            <Divider />
            <Button name="step-swap">Swap tokens</Button>
            <Button name="step-bridge">Bridge cross-chain</Button>
            <Button name="step-deposit">Deposit (Aave/Morpho)</Button>
            <Button name="step-stake">Stake (Lido/EtherFi)</Button>
            <Divider />
            <Button name="back-home">Back</Button>
          </Box>
        ));
        return;
      }

      case 'step-swap': {
        await updateUI(id, renderSwapForm());
        return;
      }

      case 'step-bridge':
      case 'step-deposit':
      case 'step-stake': {
        const actionName = (event.name ?? '').replace('step-', '');
        await updateUI(id, (
          <Box>
            <Heading>{`${actionName.charAt(0).toUpperCase()}${actionName.slice(1)}`}</Heading>
            <Text>This action type will be available soon.</Text>
            <Divider />
            <Button name="add-step">Back to Actions</Button>
            <Button name="back-home">Home</Button>
          </Box>
        ));
        return;
      }

      case 'get-quote': {
        await handleGetQuote(id, state);
        return;
      }

      case 'load-workflow': {
        const saved = state.workflows;
        if (saved.length === 0) {
          await updateUI(id, (
            <Box>
              <Heading>No Saved Workflows</Heading>
              <Text>You haven't saved any workflows yet.</Text>
              <Button name="back-home">Back</Button>
            </Box>
          ));
          return;
        }
        await updateUI(id, (
          <Box>
            <Heading>Saved Workflows</Heading>
            <Text>{`${saved.length} workflow${saved.length === 1 ? '' : 's'} saved.`}</Text>
            <Divider />
            {saved.map((w) => (
              <Button name={`load-${w.id}`}>
                {`${w.name} (${w.steps.length} steps)`}
              </Button>
            ))}
            <Divider />
            <Button name="back-home">Back</Button>
          </Box>
        ));
        return;
      }

      case 'back-home': {
        const freshState = await getState();
        await updateUI(id, renderHome(freshState));
        return;
      }

      default: {
        const name = event.name ?? '';
        if (name.startsWith('load-')) {
          const workflowId = name.replace('load-', '');
          const target = state.workflows.find((w) => w.id === workflowId);
          if (target) {
            await setState({ currentWorkflow: target });
            const updated = await getState();
            await updateUI(id, renderHome(updated));
          }
        }
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await snap.request({
      method: 'snap_updateInterface',
      params: {
        id,
        ui: (
          <Box>
            <Heading>Error</Heading>
            <Text>{msg}</Text>
            <Divider />
            <Button name="back-home">Back to Home</Button>
          </Box>
        ),
      },
    });
  }
};

export const onInstall: OnInstallHandler = async () => {
  await setState({
    currentWorkflow: {
      id: generateId(),
      name: 'Untitled Workflow',
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  await snap.request({
    method: 'snap_dialog',
    params: {
      type: 'alert',
      content: (
        <Box>
          <Heading>Welcome to Surecast</Heading>
          <Text>
            Build multi-step DeFi workflows and execute them in a single
            transaction.
          </Text>
          <Text>Open the Surecast home page from MetaMask to get started.</Text>
        </Box>
      ),
    },
  });
};

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'ping':
      return 'pong';

    case 'getState':
      return getState();

    case 'getWorkflows': {
      const s = await getState();
      return s.workflows;
    }

    case 'getCurrentWorkflow': {
      const s = await getState();
      return s.currentWorkflow;
    }

    case 'setUserAddress': {
      const params = request.params as { address: string } | undefined;
      if (!params?.address) {
        throw new Error('Missing address parameter.');
      }
      await setState({ userAddress: params.address });

      let ens: string | null = null;
      try {
        const res = await fetch(
          `https://api.ensideas.com/ens/resolve/${params.address}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { name?: string };
          if (data.name) {
            ens = data.name;
            await setState({ userEns: ens });
          }
        }
      } catch {
        // ENS lookup is best-effort
      }

      return { success: true, ens };
    }

    case 'getPreparedTransaction': {
      const s = await getState();
      return s.preparedTx;
    }

    case 'clearPreparedTransaction': {
      await setState({ preparedTx: null });
      return { success: true };
    }

    default:
      throw new Error('Method not found.');
  }
};
