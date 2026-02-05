import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import {
  ConnectButton,
  InstallFlaskButton,
  ReconnectButton,
  SendHelloButton,
  Card,
} from '../components';
import { defaultSnapOrigin } from '../config';
import {
  useMetaMask,
  useInvokeSnap,
  useMetaMaskContext,
  useRequestSnap,
} from '../hooks';
import { isLocalSnap, shouldDisplayReconnectButton } from '../utils';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  margin-top: 7.6rem;
  margin-bottom: 7.6rem;
  ${({ theme }) => theme.mediaQueries.small} {
    padding-left: 2.4rem;
    padding-right: 2.4rem;
    margin-top: 2rem;
    margin-bottom: 2rem;
    width: auto;
  }
`;

const Heading = styled.h1`
  margin-top: 0;
  margin-bottom: 2.4rem;
  text-align: center;
`;

const Span = styled.span`
  color: ${(props) => props.theme.colors.primary?.default};
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.large};
  font-weight: 500;
  margin-top: 0;
  margin-bottom: 0;
  ${({ theme }) => theme.mediaQueries.small} {
    font-size: ${({ theme }) => theme.fontSizes.text};
  }
`;

const CardContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 64.8rem;
  width: 100%;
  height: 100%;
  margin-top: 1.5rem;
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error?.muted};
  border: 1px solid ${({ theme }) => theme.colors.error?.default};
  color: ${({ theme }) => theme.colors.error?.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-bottom: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;
  ${({ theme }) => theme.mediaQueries.small} {
    padding: 1.6rem;
    margin-bottom: 1.2rem;
    margin-top: 1.2rem;
    max-width: 100%;
  }
`;

type WorkflowInfo = {
  name: string;
  stepCount: number;
} | null;

const Index = () => {
  const { provider, error } = useMetaMaskContext();
  const { isFlask, snapsDetected, installedSnap } = useMetaMask();
  const requestSnap = useRequestSnap();
  const invokeSnap = useInvokeSnap();
  const [workflowInfo, setWorkflowInfo] = useState<WorkflowInfo>(null);

  const isMetaMaskReady = isLocalSnap(defaultSnapOrigin)
    ? isFlask
    : snapsDetected;

  const syncWithSnap = useCallback(async () => {
    if (!installedSnap) return;

    const accounts = (await provider?.request({
      method: 'eth_requestAccounts',
    })) as string[] | null;

    if (accounts?.[0]) {
      await invokeSnap({
        method: 'setUserAddress',
        params: { address: accounts[0] },
      });
    }

    const workflow = (await invokeSnap({
      method: 'getCurrentWorkflow',
    })) as { name: string; steps: unknown[] } | null;

    if (workflow) {
      setWorkflowInfo({
        name: workflow.name,
        stepCount: workflow.steps?.length ?? 0,
      });
    }
  }, [installedSnap, invokeSnap, provider]);

  useEffect(() => {
    syncWithSnap();
  }, [syncWithSnap]);

  const handlePingClick = async () => {
    const result = await invokeSnap({ method: 'ping' });
    console.log('Snap responded:', result);
  };

  return (
    <Container>
      <Heading>
        Welcome to <Span>Surecast</Span>
      </Heading>
      <Subtitle>DeFi workflow composer for MetaMask</Subtitle>
      <CardContainer>
        {error && (
          <ErrorMessage>
            <b>An error happened:</b> {error.message}
          </ErrorMessage>
        )}
        {!isMetaMaskReady && (
          <Card
            content={{
              title: 'Install MetaMask Flask',
              description:
                'Snaps is pre-release software only available in MetaMask Flask, a canary distribution for developers.',
              button: <InstallFlaskButton />,
            }}
            fullWidth
          />
        )}
        {!installedSnap && (
          <Card
            content={{
              title: 'Connect',
              description: 'Connect to and install the Surecast snap.',
              button: (
                <ConnectButton
                  onClick={requestSnap}
                  disabled={!isMetaMaskReady}
                />
              ),
            }}
            disabled={!isMetaMaskReady}
          />
        )}
        {shouldDisplayReconnectButton(installedSnap) && (
          <Card
            content={{
              title: 'Reconnect',
              description:
                'Update the snap after making changes during development.',
              button: (
                <ReconnectButton
                  onClick={requestSnap}
                  disabled={!installedSnap}
                />
              ),
            }}
            disabled={!installedSnap}
          />
        )}
        {installedSnap && workflowInfo && (
          <Card
            content={{
              title: 'Current Workflow',
              description: `${workflowInfo.name} — ${workflowInfo.stepCount} step${workflowInfo.stepCount === 1 ? '' : 's'}. Open the Surecast home in MetaMask to edit.`,
            }}
            fullWidth
          />
        )}
        <Card
          content={{
            title: 'Ping Snap',
            description: 'Test the connection to the Surecast snap.',
            button: (
              <SendHelloButton
                onClick={handlePingClick}
                disabled={!installedSnap}
              />
            ),
          }}
          disabled={!installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(installedSnap) &&
            !shouldDisplayReconnectButton(installedSnap)
          }
        />
      </CardContainer>
    </Container>
  );
};

export default Index;
