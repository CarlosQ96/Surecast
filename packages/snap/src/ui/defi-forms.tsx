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
  Icon,
  Banner,
  Container,
} from '@metamask/snaps-sdk/jsx';

import { CHAINS, CHAIN_NAMES } from '../data/chains';
import { TOKENS } from '../data/tokens';
import { DEPOSIT_ASSETS } from '../data/vaults';

export function renderDepositForm(existingStepCount: number) {
  const chainEntries = Object.entries(CHAIN_NAMES);
  const defaultTokens = TOKENS[CHAINS.ARBITRUM];
  const fromTokenKeys = defaultTokens ? Object.keys(defaultTokens) : [];
  const depositAssets = DEPOSIT_ASSETS['aave-v3'] ?? ['ETH', 'USDC'];

  return (
    <Container>
      <Box>
        <Box direction="horizontal" alignment="space-between">
          <Heading>Add Deposit Step</Heading>
          <Icon name="money" color="primary" />
        </Box>
        <Banner title="Deposit" severity="info">
          <Text>Deposit tokens into a lending protocol to earn yield. LI.FI handles swap + bridge + deposit in one transaction.</Text>
        </Banner>
        <Divider />
        <Form name="deposit-form">
          <Field label="Protocol">
            <Dropdown name="protocol" value="aave-v3">
              <Option value="aave-v3">Aave V3</Option>
            </Dropdown>
          </Field>
          <Field label="From Chain">
            <Dropdown name="fromChain">
              {chainEntries.map(([, name]) => (
                <Option value={name}>{name}</Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Deposit Chain">
            <Dropdown name="toChain">
              {chainEntries.map(([, name]) => (
                <Option value={name}>{name}</Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="From Token">
            <Dropdown name="fromToken" value="ETH">
              {fromTokenKeys.map((symbol) => (
                <Option value={symbol}>{symbol}</Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Deposit Asset">
            <Dropdown name="depositAsset" value="USDC">
              {depositAssets.map((symbol) => (
                <Option value={symbol}>{symbol}</Option>
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
        <Button name="submit-deposit" variant="primary">
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

export function renderStakeForm(existingStepCount: number) {
  const chainEntries = Object.entries(CHAIN_NAMES);
  const defaultTokens = TOKENS[CHAINS.ARBITRUM];
  const fromTokenKeys = defaultTokens ? Object.keys(defaultTokens) : [];

  return (
    <Container>
      <Box>
        <Box direction="horizontal" alignment="space-between">
          <Heading>Add Stake Step</Heading>
          <Icon name="stake" color="primary" />
        </Box>
        <Banner title="Liquid Staking" severity="info">
          <Text>Stake ETH for liquid staking tokens. LI.FI handles swap + bridge + stake from any chain in one transaction.</Text>
        </Banner>
        <Divider />
        <Form name="stake-form">
          <Field label="Protocol">
            <Dropdown name="protocol" value="lido">
              <Option value="lido">Lido (wstETH)</Option>
              <Option value="etherfi">EtherFi (weETH)</Option>
            </Dropdown>
          </Field>
          <Field label="From Chain">
            <Dropdown name="fromChain">
              {chainEntries.map(([, name]) => (
                <Option value={name}>{name}</Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="From Token">
            <Dropdown name="fromToken" value="ETH">
              {fromTokenKeys.map((symbol) => (
                <Option value={symbol}>{symbol}</Option>
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
                : 'Amount (e.g. 1.5)'
            }
          >
            <Input name="amount" placeholder="1.5" />
          </Field>
        </Form>
        <Button name="submit-stake" variant="primary">
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
