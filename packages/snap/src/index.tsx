import type {
  OnHomePageHandler,
  OnInstallHandler,
  OnRpcRequestHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';
import { Box, Heading, Text, Button, Divider } from '@metamask/snaps-sdk/jsx';

import { getState, setState } from './state';
import type { SnapState } from './types';

function renderHome(state: SnapState) {
  const workflow = state.currentWorkflow;
  const stepCount = workflow?.steps.length ?? 0;

  return (
    <Box>
      <Heading>Surecast</Heading>
      <Text>DeFi workflow composer</Text>
      <Divider />
      <Text>
        {workflow
          ? `Workflow: ${workflow.name} (${stepCount} steps)`
          : 'No workflow loaded. Start by adding a step.'}
      </Text>
      <Divider />
      <Button name="add-step">Add Step</Button>
      {stepCount > 0 && <Button name="get-quote">Get Quote</Button>}
      {(state.workflows?.length ?? 0) > 0 && (
        <Button name="load-workflow">Load Saved</Button>
      )}
    </Box>
  );
}

export const onHomePage: OnHomePageHandler = async () => {
  const state = await getState();
  return { content: renderHome(state) };
};

export const onUserInput: OnUserInputHandler = async ({ id, event }) => {
  if (event.type !== UserInputEventType.ButtonClickEvent) {
    return;
  }

  const state = await getState();

  switch (event.name) {
    case 'add-step': {
      await snap.request({
        method: 'snap_updateInterface',
        params: {
          id,
          ui: (
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
          ),
        },
      });
      return;
    }

    case 'back-home': {
      await snap.request({
        method: 'snap_updateInterface',
        params: { id, ui: renderHome(state) },
      });
      return;
    }

    default:
      break;
  }
};

export const onInstall: OnInstallHandler = async () => {
  await setState({
    currentWorkflow: {
      id: crypto.randomUUID(),
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

    default:
      throw new Error('Method not found.');
  }
};
