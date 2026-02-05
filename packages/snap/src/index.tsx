import type {
  OnHomePageHandler,
  OnRpcRequestHandler,
} from '@metamask/snaps-sdk';
import { Box, Heading, Text, Button, Divider } from '@metamask/snaps-sdk/jsx';

import { getState } from './state';

export const onHomePage: OnHomePageHandler = async () => {
  const state = await getState();
  const workflow = state.currentWorkflow;
  const stepCount = workflow?.steps.length ?? 0;

  return {
    content: (
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
        {state.workflows.length > 0 && (
          <Button name="load-workflow">Load Saved</Button>
        )}
      </Box>
    ),
  };
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
