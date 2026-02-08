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
  Banner,
  Container,
} from '@metamask/snaps-sdk/jsx';

import { CHAINS, CHAIN_NAMES } from '../data/chains';
import { TOKENS } from '../data/tokens';
import type { SnapState } from '../types';

export function renderHome(state: SnapState) {
  const workflow = state.currentWorkflow;
  const steps = workflow?.steps ?? [];
  const savedCount = state.savedWorkflows?.length ?? 0;

  return (
    <Container>
      <Box>
        <Box direction="horizontal" alignment="space-between">
          <Heading size="lg">Surecast</Heading>
          <Button name="refresh" size="sm">
            <Icon name="refresh" size="inherit" />
          </Button>
        </Box>
        <Text color="muted">DeFi workflow composer</Text>

        {state.userEns ? (
          <Banner title="ENS Connected" severity="success">
            <Text>{state.userEns}</Text>
          </Banner>
        ) : null}

        <Divider />

        {/* Current Workflow Section */}
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
            {steps.map((step, i) => {
              const fromChainName =
                CHAIN_NAMES[step.config.fromChain as keyof typeof CHAIN_NAMES] ??
                '?';
              const toChainName =
                CHAIN_NAMES[step.config.toChain as keyof typeof CHAIN_NAMES] ?? '?';
              const amountDisplay = step.config.useAllFromPrevious
                ? 'all from prev'
                : (step.config.amount ?? '?');
              const isCrossChain = step.config.fromChain !== step.config.toChain;

              return (
                <Box>
                  <Card
                    title={`Step ${i + 1}: ${step.type.toUpperCase()}`}
                    description={
                      isCrossChain
                        ? `${fromChainName} → ${toChainName}`
                        : fromChainName
                    }
                    value={`${amountDisplay} ${step.config.fromToken ?? '?'} → ${step.config.toToken ?? '?'}`}
                    extra={step.config.protocol
                      ? `${step.type} · ${step.config.protocol}`
                      : step.type}
                  />
                  <Button
                    name={`delete-step-${step.id}`}
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

        <Divider />

        {/* Primary Actions */}
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
        </Section>

        {/* Workflow Management */}
        <Section>
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

        {/* ENS Sharing */}
        {steps.length > 0 ? (
          <>
            <Divider />
            <Section>
              <Banner title="ENS Sharing" severity="info">
                <Text>Save this workflow on-chain for replay and sharing.</Text>
              </Banner>
              {state.userEns ? (
                <Text color="muted" size="sm">{`Saving to: ${state.userEns}`}</Text>
              ) : (
                <Text color="muted" size="sm">Open the Surecast site to connect your ENS name.</Text>
              )}
              <Button name="save-to-ens" variant="primary">
                <Icon name="export" size="inherit" />
                {' Save to ENS'}
              </Button>
            </Section>
          </>
        ) : null}
      </Box>
    </Container>
  );
}

export function renderSwapForm(existingStepCount: number) {
  const chainEntries = Object.entries(CHAIN_NAMES);
  const defaultTokens = TOKENS[CHAINS.ARBITRUM];
  const tokenKeys = defaultTokens ? Object.keys(defaultTokens) : [];

  return (
    <Container>
      <Box>
        <Box direction="horizontal" alignment="space-between">
          <Heading>Add Swap Step</Heading>
          <Icon name="swap-horizontal" color="primary" />
        </Box>
        <Banner title="Swap" severity="info">
          <Text>Exchange tokens on the same chain or bridge cross-chain via LI.FI.</Text>
        </Banner>
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
    </Container>
  );
}

export function renderRenameForm(currentName: string) {
  return (
    <Container>
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
    </Container>
  );
}

export function renderWorkflowList(state: SnapState) {
  const saved = state.savedWorkflows ?? [];

  return (
    <Container>
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
    </Container>
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
