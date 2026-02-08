import {
  Box,
  Heading,
  Text,
  Button,
  Divider,
  Section,
  Card,
  Icon,
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
  const savedCount = state.savedWorkflows?.length ?? 0;

  return (
    <Box>
      <Box direction="horizontal" alignment="space-between">
        <Heading size="lg">Surecast</Heading>
        <Button name="refresh" size="sm">
          <Icon name="refresh" size="inherit" />
        </Button>
      </Box>
      <Text color="muted">DeFi workflow composer</Text>
      {state.userEns ? (
        <Text color="alternative" size="sm">{`ENS: ${state.userEns}`}</Text>
      ) : null}

      <Divider />

      {workflow ? (
        <Section>
          <Box direction="horizontal" alignment="space-between">
            <Text fontWeight="bold">{workflow.name}</Text>
            <Button name="show-rename" size="sm">
              <Icon name="edit" size="inherit" />
            </Button>
          </Box>
          <Text color="muted" size="sm">
            {`${steps.length} step${steps.length === 1 ? '' : 's'}`}
          </Text>
          {steps.length === 0 ? (
            <Text color="muted">No steps yet. Add one below.</Text>
          ) : null}
          {steps.map((s, i) => {
            const fromChainName =
              CHAIN_NAMES[s.config.fromChain as keyof typeof CHAIN_NAMES] ??
              '?';
            const toChainName =
              CHAIN_NAMES[s.config.toChain as keyof typeof CHAIN_NAMES] ?? '?';
            const amountDisplay = s.config.useAllFromPrevious
              ? 'all from prev'
              : (s.config.amount ?? '?');
            const isCrossChain = s.config.fromChain !== s.config.toChain;

            return (
              <Box>
                <Card
                  title={`Step ${i + 1}: ${s.type.toUpperCase()}`}
                  description={
                    isCrossChain
                      ? `${fromChainName} → ${toChainName}`
                      : fromChainName
                  }
                  value={`${amountDisplay} ${s.config.fromToken ?? '?'} → ${s.config.toToken ?? '?'}`}
                  extra={s.type}
                />
                <Button
                  name={`delete-step-${s.id}`}
                  variant="destructive"
                  size="sm"
                >
                  <Icon name="trash" size="inherit" />
                  {' Remove'}
                </Button>
              </Box>
            );
          })}
        </Section>
      ) : (
        <Section>
          <Text color="muted">No workflow loaded. Add a step to begin.</Text>
        </Section>
      )}

      <Section>
        <Button name="add-step" variant="primary">
          <Icon name="add" size="inherit" />
          {' Add Step'}
        </Button>
        {steps.length > 0 ? (
          <Button name="get-quote">
            <Icon name="flash" size="inherit" />
            {' Get Quote'}
          </Button>
        ) : null}
        {workflow && steps.length > 0 ? (
          <Button name="save-workflow">
            <Icon name="export" size="inherit" />
            {' Save Workflow'}
          </Button>
        ) : null}
        <Button name="new-workflow">
          <Icon name="add" size="inherit" />
          {' New Workflow'}
        </Button>
        <Button name="show-saved">
          <Icon name="menu" size="inherit" />
          {` My Workflows (${savedCount})`}
        </Button>
      </Section>

      {steps.length > 0 ? (
        <Section>
          {state.userEns ? (
            <Text color="muted" size="sm">{`ENS: ${state.userEns}`}</Text>
          ) : (
            <Text color="muted" size="sm">Open the Surecast site to connect your ENS name.</Text>
          )}
          <Button name="save-to-ens" variant="primary">
            <Icon name="export" size="inherit" />
            {' Save to ENS'}
          </Button>
        </Section>
      ) : null}
    </Box>
  );
}

export function renderSwapForm(existingStepCount: number) {
  const chainEntries = Object.entries(CHAIN_NAMES);
  const defaultTokens = TOKENS[CHAINS.ARBITRUM];
  const tokenKeys = defaultTokens ? Object.keys(defaultTokens) : [];

  return (
    <Box>
      <Box direction="horizontal" alignment="space-between">
        <Heading>Add Swap Step</Heading>
        <Icon name="swap-horizontal" color="primary" />
      </Box>
      <Text color="muted" size="sm">Configure a token swap or bridge</Text>
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
              <Option value="Yes">Yes - use all output</Option>
            </Dropdown>
          </Field>
        )}
        <Field
          label={
            existingStepCount > 0
              ? 'Amount (ignored if using previous output)'
              : 'Amount (e.g. 10)'
          }
        >
          <Input name="amount" placeholder="10" />
        </Field>
      </Form>
      <Button name="submit-swap" variant="primary">
        <Icon name="add" size="inherit" />
        {' Add to Workflow'}
      </Button>
      <Divider />
      <Button name="back-home">
        <Icon name="arrow-left" size="inherit" />
        {' Cancel'}
      </Button>
    </Box>
  );
}

export function renderRenameForm(currentName: string) {
  return (
    <Box>
      <Box direction="horizontal" alignment="space-between">
        <Heading>Rename Workflow</Heading>
        <Icon name="edit" color="primary" />
      </Box>
      <Divider />
      <Form name="rename-form">
        <Field label="Workflow Name">
          <Input name="workflowName" placeholder={currentName} />
        </Field>
      </Form>
      <Button name="submit-rename" variant="primary">
        <Icon name="confirmation" size="inherit" />
        {' Save Name'}
      </Button>
      <Button name="back-home">
        <Icon name="arrow-left" size="inherit" />
        {' Cancel'}
      </Button>
    </Box>
  );
}

export function renderWorkflowList(state: SnapState) {
  const saved = state.savedWorkflows ?? [];

  return (
    <Box>
      <Box direction="horizontal" alignment="space-between">
        <Heading>My Workflows</Heading>
        <Icon name="menu" color="primary" />
      </Box>
      <Text color="muted" size="sm">{`${saved.length} saved workflow${saved.length === 1 ? '' : 's'}`}</Text>
      <Divider />

      {saved.length === 0 ? (
        <Section>
          <Text color="muted">No saved workflows yet. Save your current workflow from the home screen.</Text>
        </Section>
      ) : null}

      {saved.map((workflow) => {
        const stepCount = workflow.steps?.length ?? 0;
        const date = new Date(workflow.updatedAt).toLocaleDateString();

        return (
          <Section>
            <Card
              title={workflow.name}
              description={`${stepCount} step${stepCount === 1 ? '' : 's'} — updated ${date}`}
              value={workflow.steps.map((step) => step.type.toUpperCase()).join(' → ')}
              extra={workflow.id}
            />
            <Box direction="horizontal">
              <Button name={`load-saved-${workflow.id}`} variant="primary" size="sm">
                <Icon name="download" size="inherit" />
                {' Load'}
              </Button>
              <Button name={`delete-saved-${workflow.id}`} variant="destructive" size="sm">
                <Icon name="trash" size="inherit" />
                {' Delete'}
              </Button>
            </Box>
          </Section>
        );
      })}

      <Divider />
      <Button name="back-home">
        <Icon name="arrow-left" size="inherit" />
        {' Back'}
      </Button>
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
