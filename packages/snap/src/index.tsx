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

      case 'load-workflow': {
        const saved = state.workflows;
        if (saved.length === 0) {
          await updateUI(id, (
            <Box>
              <Banner title="No Saved Workflows" severity="warning">
                <Text>You haven't saved any workflows yet.</Text>
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
              <Heading>Saved Workflows</Heading>
              <Icon name="download" color="primary" />
            </Box>
            <Text color="muted" size="sm">
              {`${saved.length} workflow${saved.length === 1 ? '' : 's'} saved`}
            </Text>
            <Divider />
            <Section>
              {saved.map((w) => (
                <Button name={`load-${w.id}`}>
                  {`${w.name} (${w.steps.length} steps)`}
                </Button>
              ))}
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

      case 'save-workflow': {
        const workflow = state.currentWorkflow;
        await updateUI(id, (
          <Box>
            <Box direction="horizontal" alignment="space-between">
              <Heading>Save Workflow</Heading>
              <Icon name="save" color="primary" />
            </Box>
            <Divider />
            <Form name="save-form">
              <Field label="Workflow Name">
                <Input name="workflowName" placeholder={workflow?.name ?? 'My Workflow'} />
              </Field>
              <Button name="submit-save" variant="primary">
                <Icon name="save" size="inherit" />
                {' Save'}
              </Button>
            </Form>
            <Divider />
            <Button name="back-home">
              <Icon name="arrow-left" size="inherit" />
              {' Cancel'}
            </Button>
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
              <Banner title="No Workflow" severity="warning">
                <Text>No active workflow to save.</Text>
              </Banner>
              <Button name="back-home">
                <Icon name="home" size="inherit" />
                {' Back'}
              </Button>
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
            <Banner title="Workflow Saved" severity="success">
              <Text>{`"${saveName}" saved with ${saved.steps.length} step(s).`}</Text>
            </Banner>
            <Button name="back-home" variant="primary">
              <Icon name="home" size="inherit" />
              {' Back to Home'}
            </Button>
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
