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

import { getState, setState, writeState, refreshState } from './state';
/* setState only used by onInstall; getState returns from cache after first call */
import { generateId } from './helpers';
import { renderHome, renderSwapForm, renderRenameForm, renderWorkflowList, updateUI } from './ui';
import { renderDepositForm, renderStakeForm } from './ui/defi-forms';
import { handleSwapSubmit, handleGetQuote, handleRename, handleSaveToEns, handleSaveWorkflow, handleLoadSavedWorkflow, handleDeleteSavedWorkflow } from './handlers';
import { handleDepositSubmit, handleStakeSubmit } from './handlers/defi';

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

    // 1) Read persistent state from cache (0 SES calls after first load)
    const state = await getState();

    // 2) Only read form state for submit buttons (saves 1 SES call on navigation)
    const needsFormData =
      event.name === 'submit-swap' ||
      event.name === 'submit-rename' ||
      event.name === 'submit-deposit' ||
      event.name === 'submit-stake';
    let swapForm: Record<string, string> = {};
    let renameForm: Record<string, string> = {};
    let depositForm: Record<string, string> = {};
    let stakeForm: Record<string, string> = {};
    if (needsFormData) {
      const interfaceState = await snap.request({
        method: 'snap_getInterfaceState',
        params: { id },
      });
      const formState = interfaceState as Record<string, Record<string, string>>;
      swapForm = formState?.['swap-form'] ?? {};
      renameForm = formState?.['rename-form'] ?? {};
      depositForm = formState?.['deposit-form'] ?? {};
      stakeForm = formState?.['stake-form'] ?? {};
    }

    // 3) Route by button name — each case does 1-2 SES calls max
    switch (event.name) {
      case 'submit-swap': {
        await handleSwapSubmit(id, state, swapForm);
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

      case 'step-deposit': {
        const depositStepCount = state.currentWorkflow?.steps.length ?? 0;
        await updateUI(id, renderDepositForm(depositStepCount));
        return;
      }

      case 'step-stake': {
        const stakeStepCount = state.currentWorkflow?.steps.length ?? 0;
        await updateUI(id, renderStakeForm(stakeStepCount));
        return;
      }

      case 'submit-deposit': {
        await handleDepositSubmit(id, state, depositForm);
        return;
      }

      case 'submit-stake': {
        await handleStakeSubmit(id, state, stakeForm);
        return;
      }

      case 'step-bridge': {
        await updateUI(id, (
          <Box>
            <Box direction="horizontal" alignment="space-between">
              <Heading>Bridge</Heading>
              <Icon name="clock" color="muted" />
            </Box>
            <Banner title="Coming Soon" severity="info">
              <Text>Use Swap with different from/to chains for cross-chain bridging.</Text>
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

      case 'show-rename': {
        const currentName = state.currentWorkflow?.name ?? 'Untitled Workflow';
        await updateUI(id, renderRenameForm(currentName));
        return;
      }

      case 'submit-rename': {
        await handleRename(id, state, renameForm);
        return;
      }

      case 'save-to-ens': {
        await handleSaveToEns(id, state);
        return;
      }

      case 'get-quote': {
        await handleGetQuote(id, state);
        return;
      }

      case 'save-workflow': {
        await handleSaveWorkflow(id, state);
        return;
      }

      case 'show-saved': {
        await updateUI(id, renderWorkflowList(state));
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

      case 'refresh': {
        const freshState = await refreshState();
        await updateUI(id, renderHome(freshState));
        return;
      }

      case 'back-home': {
        await updateUI(id, renderHome(state));
        return;
      }

      default: {
        const name = event.name ?? '';
        if (name.startsWith('delete-step-')) {
          const stepId = name.replace('delete-step-', '');
          const currentWorkflow = state.currentWorkflow;
          if (currentWorkflow) {
            const filteredSteps = currentWorkflow.steps.filter((step) => step.id !== stepId);
            const updatedWorkflow = { ...currentWorkflow, steps: filteredSteps, updatedAt: Date.now() };
            const updatedState = await writeState(state, { currentWorkflow: updatedWorkflow });
            await updateUI(id, renderHome(updatedState));
          }
        } else if (name.startsWith('load-saved-')) {
          const workflowId = name.replace('load-saved-', '');
          await handleLoadSavedWorkflow(id, state, workflowId);
        } else if (name.startsWith('delete-saved-')) {
          const workflowId = name.replace('delete-saved-', '');
          await handleDeleteSavedWorkflow(id, state, workflowId);
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
