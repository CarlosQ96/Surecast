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
} from '@metamask/snaps-sdk/jsx';

import { CHAINS, CHAIN_NAMES } from '../data/chains';
import { TOKENS } from '../data/tokens';
import type { SnapState } from '../types';

export function renderHome(state: SnapState) {
  const workflow = state.currentWorkflow;
  const steps = workflow?.steps ?? [];

  return (
    <Box>
      <Heading>Surecast</Heading>
      <Text>DeFi workflow composer</Text>
      {state.userEns ? <Text>{`ENS: ${state.userEns}`}</Text> : null}
      <Divider />
      {workflow ? (
        <Box>
          <Text>{`Workflow: ${workflow.name}`}</Text>
          {steps.length === 0 && <Text>No steps yet. Add one below.</Text>}
          {steps.map((s, i) => {
            const fromChainName = CHAIN_NAMES[s.config.fromChain as keyof typeof CHAIN_NAMES] ?? '?';
            const toChainName = CHAIN_NAMES[s.config.toChain as keyof typeof CHAIN_NAMES] ?? '?';
            const amountDisplay = s.config.useAllFromPrevious ? 'all from prev' : (s.config.amount ?? '?');
            const isCrossChain = s.config.fromChain !== s.config.toChain;
            return (
              <Box>
                <Text>{`${i + 1}. ${s.type.toUpperCase()} ${amountDisplay} ${s.config.fromToken ?? '?'} on ${fromChainName} → ${s.config.toToken ?? '?'}${isCrossChain ? ` on ${toChainName}` : ''}`}</Text>
                <Button name={`delete-step-${s.id}`}>Remove</Button>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Text>No workflow loaded. Start by adding a step.</Text>
      )}
      <Divider />
      <Button name="add-step">Add Step</Button>
      {steps.length > 0 && <Button name="get-quote">Get Quote</Button>}
      {steps.length > 0 && <Button name="save-workflow">Save Workflow</Button>}
      {state.userEns && steps.length > 0 ? <Text>Open executor page to save to ENS.</Text> : null}
      {(state.workflows?.length ?? 0) > 0 && (
        <Button name="load-workflow">Load Saved</Button>
      )}
    </Box>
  );
}

export function renderSwapForm(existingStepCount: number) {
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
        {existingStepCount > 0 && (
          <Field label="Use output from previous step?">
            <Dropdown name="useAllFromPrevious" value="No">
              <Option value="No">No - enter amount manually</Option>
              <Option value="Yes">Yes - use all output from previous step</Option>
            </Dropdown>
          </Field>
        )}
        <Field label={existingStepCount > 0 ? 'Amount (ignored if using previous output)' : 'Amount (e.g. 10)'}>
          <Input name="amount" placeholder="10" />
        </Field>
        <Button name="submit-swap">Add to Workflow</Button>
      </Form>
      <Divider />
      <Button name="back-home">Cancel</Button>
    </Box>
  );
}

export async function updateUI(
  id: string,
  ui: ReturnType<typeof renderHome>,
) {
  await snap.request({
    method: 'snap_updateInterface',
    params: { id, ui },
  });
}
