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
  Form,
  Field,
  Input,
} from '@metamask/snaps-sdk/jsx';

import { getState, setState } from './state';
import { generateId } from './helpers';
import { renderHome, renderSwapForm, updateUI } from './ui';
import { handleSwapSubmit, handleGetQuote } from './handlers';

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

      case 'save-workflow': {
        const workflow = state.currentWorkflow;
        await updateUI(id, (
          <Box>
            <Heading>Save Workflow</Heading>
            <Form name="save-form">
              <Field label="Workflow Name">
                <Input name="workflowName" placeholder={workflow?.name ?? 'My Workflow'} />
              </Field>
              <Button name="submit-save">Save</Button>
            </Form>
            <Divider />
            <Button name="back-home">Cancel</Button>
          </Box>
        ));
        return;
      }

      case 'submit-save': {
        const saveFormState = await snap.request({
          method: 'snap_getInterfaceState',
          params: { id },
        }) as Record<string, Record<string, string | null>>;

        const saveVals = (saveFormState?.['save-form'] ?? {}) as Record<string, string | null>;
        const saveName = String(saveVals.workflowName ?? '').trim() || 'Untitled Workflow';

        const wf = state.currentWorkflow;
        if (!wf) {
          await updateUI(id, (
            <Box>
              <Heading>No Workflow</Heading>
              <Text>No active workflow to save.</Text>
              <Button name="back-home">Back</Button>
            </Box>
          ));
          return;
        }

        const saved = { ...wf, name: saveName, updatedAt: Date.now() };
        const workflows = [...state.workflows];
        const existingIdx = workflows.findIndex((w) => w.id === saved.id);
        if (existingIdx >= 0) {
          workflows[existingIdx] = saved;
        } else {
          workflows.push(saved);
        }

        await setState({ currentWorkflow: saved, workflows });

        await updateUI(id, (
          <Box>
            <Heading>Workflow Saved</Heading>
            <Text>{`"${saveName}" saved with ${saved.steps.length} step(s).`}</Text>
            <Button name="back-home">Back to Home</Button>
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
        } else if (name.startsWith('delete-step-')) {
          const stepId = name.replace('delete-step-', '');
          const workflow = state.currentWorkflow;
          if (workflow) {
            const filtered = workflow.steps.filter((s) => s.id !== stepId);
            const updated = { ...workflow, steps: filtered, updatedAt: Date.now() };
            await setState({ currentWorkflow: updated });
            const freshState = await getState();
            await updateUI(id, renderHome(freshState));
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
