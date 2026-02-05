import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import {
  ConnectButton,
  InstallFlaskButton,
  ReconnectButton,
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

// ============================================================
// TYPES
// ============================================================

type ExecutorStatus =
  | 'idle'
  | 'fetching'
  | 'switching-chain'
  | 'confirming'
  | 'success'
  | 'error';

interface PreparedTransaction {
  to: string;
  value: string;
  data: string;
  chainId: number;
  description?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const BLOCK_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
};

const CHAIN_CONFIGS: Record<
  number,
  {
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  }
> = {
  42161: {
    chainName: 'Arbitrum One',
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://arbiscan.io'],
  },
  10: {
    chainName: 'Optimism',
    rpcUrls: ['https://mainnet.optimism.io'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
  },
  137: {
    chainName: 'Polygon',
    rpcUrls: ['https://polygon-rpc.com'],
    nativeCurrency: { name: 'MATIC', symbol: 'POL', decimals: 18 },
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  8453: {
    chainName: 'Base',
    rpcUrls: ['https://mainnet.base.org'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://basescan.org'],
  },
};

// ============================================================
// INLINE STYLES
// ============================================================

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: 1,
  marginTop: '7.6rem',
  marginBottom: '7.6rem',
  padding: '0 2rem',
};

const headingStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: '2.4rem',
  textAlign: 'center',
};

const subtitleStyle: CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 500,
  marginTop: 0,
  marginBottom: 0,
};

const cardContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  maxWidth: '64.8rem',
  width: '100%',
  height: '100%',
  marginTop: '1.5rem',
};

const errorMessageStyle: CSSProperties = {
  backgroundColor: '#f8d7da',
  border: '1px solid #dc3545',
  color: '#721c24',
  borderRadius: '8px',
  padding: '2.4rem',
  marginBottom: '2.4rem',
  marginTop: '2.4rem',
  maxWidth: '60rem',
  width: '100%',
};

const getExecutorBoxStyle = (status: ExecutorStatus): CSSProperties => ({
  backgroundColor:
    status === 'success' ? '#d4edda' : status === 'error' ? '#f8d7da' : '#f8f9fa',
  border: `1px solid ${status === 'success' ? '#28a745' : status === 'error' ? '#dc3545' : '#dee2e6'}`,
  borderRadius: '8px',
  padding: '2rem',
  marginTop: '2rem',
  maxWidth: '64.8rem',
  width: '100%',
  textAlign: 'center',
  color: '#212529',
});

const statusMessageStyle: CSSProperties = {
  fontSize: '1.1rem',
  margin: '0.5rem 0',
};

const txHashLinkStyle: CSSProperties = {
  color: '#007bff',
  wordBreak: 'break-all',
  fontFamily: 'monospace',
  fontSize: '0.9rem',
};

const executeButtonStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: '1rem',
  padding: '0.75rem 1.5rem',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontWeight: 500,
  fontSize: '1rem',
  cursor: 'pointer',
};

const retryButtonStyle: CSSProperties = {
  marginTop: '1rem',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  border: '1px solid #dc3545',
  background: 'white',
  borderRadius: '4px',
  color: '#dc3545',
  fontWeight: 500,
};

const spinnerStyle: CSSProperties = {
  border: '4px solid #dee2e6',
  borderTop: '4px solid #007bff',
  borderRadius: '50%',
  width: '40px',
  height: '40px',
  animation: 'spin 1s linear infinite',
  margin: '1rem auto',
};

const txDescriptionStyle: CSSProperties = {
  fontSize: '0.95rem',
  color: '#555',
  margin: '0.25rem 0',
};

// ============================================================
// HELPERS
// ============================================================

function getBlockExplorerUrl(chainId: number | null, hash: string): string {
  const baseUrl =
    chainId && BLOCK_EXPLORERS[chainId]
      ? BLOCK_EXPLORERS[chainId]
      : 'https://etherscan.io';
  return `${baseUrl}/tx/${hash}`;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

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

  // Executor state
  const [execStatus, setExecStatus] = useState<ExecutorStatus>('idle');
  const [execMessage, setExecMessage] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txChainId, setTxChainId] = useState<number | null>(null);
  const [txDescription, setTxDescription] = useState<string | null>(null);

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

  // ============================================================
  // EXECUTOR: Fetch prepared tx from snap and send it
  // ============================================================

  const executeTransaction = useCallback(async () => {
    if (!provider) return;

    try {
      // Step 1: Get user accounts
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts?.[0]) {
        setExecStatus('error');
        setExecMessage('No wallet accounts found. Please connect MetaMask.');
        return;
      }

      // Step 2: Tell snap the user's address
      await invokeSnap({
        method: 'setUserAddress',
        params: { address: accounts[0] },
      });

      // Step 3: Get prepared transaction from snap
      setExecStatus('fetching');
      setExecMessage('Fetching prepared transaction from Surecast...');

      const txData = (await invokeSnap({
        method: 'getPreparedTransaction',
      })) as PreparedTransaction | null;

      if (!txData) {
        setExecStatus('error');
        setExecMessage(
          'No transaction prepared. Open the Surecast snap home in MetaMask and create a swap first.',
        );
        return;
      }

      console.log('Received prepared tx:', txData);
      setTxDescription(txData.description || null);

      // Step 4: Switch chain if needed
      if (txData.chainId) {
        setExecStatus('switching-chain');
        setExecMessage(
          `Switching to chain ${txData.chainId}...`,
        );

        const chainIdHex = `0x${txData.chainId.toString(16)}`;
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } catch (switchError: unknown) {
          if ((switchError as { code?: number }).code === 4902) {
            const config = CHAIN_CONFIGS[txData.chainId];
            if (config) {
              await provider.request({
                method: 'wallet_addEthereumChain',
                params: [{ chainId: chainIdHex, ...config }],
              });
            } else {
              throw new Error(
                `Unknown chain ID: ${txData.chainId}. Please add it to MetaMask manually.`,
              );
            }
          } else {
            throw switchError;
          }
        }
      }

      // Step 5: Send transaction - NO gasLimit, let MetaMask estimate
      setExecStatus('confirming');
      setExecMessage('Please confirm the transaction in MetaMask...');

      const hash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: accounts[0],
            to: txData.to,
            value: txData.value,
            data: txData.data,
          },
        ],
      })) as string;

      // Step 6: Clear prepared transaction from snap
      await invokeSnap({ method: 'clearPreparedTransaction' });

      setExecStatus('success');
      setTxHash(hash);
      setTxChainId(txData.chainId || 1);
      setExecMessage('Transaction submitted successfully!');
    } catch (err: unknown) {
      setExecStatus('error');
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred';
      setExecMessage(errorMessage);
      console.error('Executor error:', err);
    }
  }, [provider, invokeSnap]);

  const resetExecutor = () => {
    setExecStatus('idle');
    setExecMessage('');
    setTxHash(null);
    setTxChainId(null);
    setTxDescription(null);
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>
        Welcome to <span style={{ color: '#8b5cf6' }}>Surecast</span>
      </h1>
      <p style={subtitleStyle}>DeFi workflow composer for MetaMask</p>
      <div style={cardContainerStyle}>
        {error && (
          <div style={errorMessageStyle}>
            <b>An error happened:</b> {error.message}
          </div>
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
      </div>

      {/* Executor Section */}
      {installedSnap && (
        <div style={getExecutorBoxStyle(execStatus)}>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <h3 style={{ margin: '0 0 0.5rem', color: '#212529' }}>Transaction Executor</h3>

          {execStatus === 'idle' && (
            <>
              <p style={statusMessageStyle}>
                Prepare a swap in the Surecast snap, then execute it here.
              </p>
              <button style={executeButtonStyle} onClick={executeTransaction}>
                Execute Prepared Transaction
              </button>
            </>
          )}

          {(execStatus === 'fetching' ||
            execStatus === 'switching-chain' ||
            execStatus === 'confirming') && (
            <>
              <div style={spinnerStyle} />
              <p style={statusMessageStyle}>{execMessage}</p>
            </>
          )}

          {execStatus === 'success' && (
            <>
              <p style={statusMessageStyle}>{execMessage}</p>
              {txDescription && (
                <p style={txDescriptionStyle}>{txDescription}</p>
              )}
              {txHash && (
                <>
                  <p>
                    <strong>Transaction Hash:</strong>
                  </p>
                  <a
                    style={txHashLinkStyle}
                    href={getBlockExplorerUrl(txChainId, txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {txHash}
                  </a>
                </>
              )}
              <br />
              <button style={{ ...executeButtonStyle, marginTop: '1rem' }} onClick={resetExecutor}>
                Execute Another
              </button>
            </>
          )}

          {execStatus === 'error' && (
            <>
              <p style={statusMessageStyle}>{execMessage}</p>
              <button style={retryButtonStyle} onClick={resetExecutor}>Retry</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;
