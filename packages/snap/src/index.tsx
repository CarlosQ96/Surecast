import type {
  OnHomePageHandler,
  OnInstallHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';
import {
  Box,
  Heading,
  Text,
  Button,
  Divider,
  Section,
  Icon,
  Banner,
} from '@metamask/snaps-sdk/jsx';

import { getState, setState, writeState } from './state';
/* setState only used by onInstall; getState returns from cache after first call */
import { generateId } from './helpers';
import { renderHome, renderSwapForm, updateUI } from './ui';
import {
  handleSwapSubmit,
  handleGetQuote,
  handleSaveWorkflow,
  handleSubmitSave,
  handleLoadWorkflow,
  handleDeleteWorkflow,
} from './handlers';

export { onRpcRequest } from './rpc';

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
    // Only handle button clicks (PolkaGate pattern)
    if (event.type !== UserInputEventType.ButtonClickEvent) {
      return;
    }

    // 1) Read interface state once at top — gets all form values (1 SES call)
    const interfaceState = await snap.request({
      method: 'snap_getInterfaceState',
      params: { id },
    });
    const formState = interfaceState as Record<string, Record<string, string>>;
    const swapForm = formState?.['swap-form'] ?? {};
    const saveForm = formState?.['save-form'] ?? {};

    // 2) Read persistent state from cache (0 SES calls after first load)
    const state = await getState();

    // 3) Route by button name — each case does 1-2 SES calls max
    switch (event.name) {
      case 'submit-swap': {
        await handleSwapSubmit(id, state, swapForm);
        return;
      }

      case 'submit-save': {
        await handleSubmitSave(id, state, saveForm);
        return;
      }

      case 'add-step': {
        await updateUI(id, (
          <Box>
            <Box direction="horizontal" alignment="space-between">
              <Heading>Add Step</Heading>
              <Icon name="category" color="primary" />
            </Box>
            <Text color="muted" size="sm">Choose an action for this step</Text>
            <Divider />
            <Section>
              <Button name="step-swap" variant="primary">
                <Icon name="swap-horizontal" size="inherit" />
                {' Swap tokens'}
              </Button>
              <Button name="step-bridge">
                <Icon name="bridge" size="inherit" />
                {' Bridge cross-chain'}
              </Button>
              <Button name="step-deposit">
                <Icon name="money" size="inherit" />
                {' Deposit (Aave/Morpho)'}
              </Button>
              <Button name="step-stake">
                <Icon name="stake" size="inherit" />
                {' Stake (Lido/EtherFi)'}
              </Button>
            </Section>
            <Divider />
            <Button name="back-home">
              <Icon name="arrow-left" size="inherit" />
              {' Back'}
            </Button>
          </Box>
        ));
        return;
      }

      case 'step-swap': {
        const stepCount = state.currentWorkflow?.steps.length ?? 0;
        await updateUI(id, renderSwapForm(stepCount));
        return;
      }

      case 'step-bridge':
      case 'step-deposit':
      case 'step-stake': {
        const actionName = (event.name ?? '').replace('step-', '');
        await updateUI(id, (
          <Box>
            <Box direction="horizontal" alignment="space-between">
              <Heading>{`${actionName.charAt(0).toUpperCase()}${actionName.slice(1)}`}</Heading>
              <Icon name="clock" color="muted" />
            </Box>
            <Banner title="Coming Soon" severity="info">
              <Text>This action type will be available soon.</Text>
            </Banner>
            <Section>
              <Button name="add-step" variant="primary">
                <Icon name="arrow-left" size="inherit" />
                {' Back to Actions'}
              </Button>
              <Button name="back-home">
                <Icon name="home" size="inherit" />
                {' Home'}
              </Button>
            </Section>
          </Box>
        ));
        return;
      }

      case 'get-quote': {
        await handleGetQuote(id, state);
        return;
      }

      case 'new-workflow': {
        const newWorkflow = {
          id: generateId(),
          name: 'Untitled Workflow',
          steps: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const newState = await writeState(state, { currentWorkflow: newWorkflow });
        await updateUI(id, renderHome(newState));
        return;
      }

      case 'load-workflow': {
        await handleLoadWorkflow(id, state);
        return;
      }

      case 'save-workflow': {
        await handleSaveWorkflow(id, state);
        return;
      }

      case 'back-home': {
        await updateUI(id, renderHome(state));
        return;
      }

      default: {
        const name = event.name ?? '';
        if (name.startsWith('load-')) {
          const workflowId = name.replace('load-', '');
          const target = state.workflows.find((workflow) => workflow.id === workflowId);
          if (target) {
            const loadedState = await writeState(state, { currentWorkflow: target });
            await updateUI(id, renderHome(loadedState));
          }
        } else if (name.startsWith('delete-workflow-')) {
          const workflowId = name.replace('delete-workflow-', '');
          await handleDeleteWorkflow(id, workflowId, state);
        } else if (name.startsWith('delete-step-')) {
          const stepId = name.replace('delete-step-', '');
          const currentWorkflow = state.currentWorkflow;
          if (currentWorkflow) {
            const filteredSteps = currentWorkflow.steps.filter((step) => step.id !== stepId);
            const updatedWorkflow = { ...currentWorkflow, steps: filteredSteps, updatedAt: Date.now() };
            const updatedState = await writeState(state, { currentWorkflow: updatedWorkflow });
            await updateUI(id, renderHome(updatedState));
          }
        }
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await snap.request({
        method: 'snap_updateInterface',
        params: {
          id,
          ui: (
            <Box>
              <Banner title="Error" severity="danger">
                <Text>{msg}</Text>
              </Banner>
              <Button name="back-home" variant="primary">
                <Icon name="home" size="inherit" />
                {' Back to Home'}
              </Button>
            </Box>
          ),
        },
      });
    } catch {
      console.error('Snap error (UI update also failed):', msg);
    }
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
          <Box direction="horizontal" alignment="space-between">
            <Heading size="lg">Welcome to Surecast</Heading>
            <Icon name="flash" color="primary" />
          </Box>
          <Text>
            Build multi-step DeFi workflows and execute them seamlessly.
          </Text>
          <Divider />
          <Text color="muted" size="sm">
            Open the Surecast home page from MetaMask to get started.
          </Text>
        </Box>
      ),
    },
  });
};
