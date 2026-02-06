import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

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
import { namehash, encodeGetText, decodeTextResult, ENS_PUBLIC_RESOLVER, ENS_WORKFLOW_KEY } from '../utils/ens';

// ============================================================
// TYPES
// ============================================================

type ExecutorStatus =
  | 'idle'
  | 'loading-workflow'
  | 'executing'
  | 'paused'
  | 'success'
  | 'error';

type StepExecutionStatus =
  | 'pending'
  | 'quoting'
  | 'ready'
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
  stepId?: string;
}

interface StepExecution {
  stepId: string;
  status: StepExecutionStatus;
  txHash: string | null;
  chainId: number | null;
  error: string | null;
  quotedOutput: string | null;
  quotedOutputDecimals: number | null;
}

interface WorkflowExecution {
  workflowId: string;
  startedAt: number;
  currentStepIndex: number;
  steps: StepExecution[];
  status: 'running' | 'paused' | 'completed' | 'failed';
}

interface WorkflowStep {
  id: string;
  type: string;
  config: {
    protocol?: string;
    fromToken?: string;
    toToken?: string;
    amount?: string;
    useAllFromPrevious?: boolean;
    fromChain?: number;
    toChain?: number;
  };
}

interface FullWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
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

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
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

const COLORS = {
  primary: '#3F49E1',
  primaryHover: '#7C83EB',
  black: '#000000',
  white: '#FFFFFF',
  offWhite: '#F6F3F2',
  grayLight: '#E4E7E9',
  grayMid: '#798086',
  grayDark: '#212529',
  success: '#28a745',
  successBg: '#d4edda',
  error: '#dc3545',
  errorBg: '#f8d7da',
  errorText: '#721c24',
  warningBg: '#fff3cd',
  infoBg: '#e7edfb',
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
  fontFamily: 'Inter, system-ui, sans-serif',
};

const headingStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: '2.4rem',
  textAlign: 'center',
  letterSpacing: '-0.5px',
};

const subtitleStyle: CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 500,
  marginTop: 0,
  marginBottom: 0,
  color: COLORS.grayMid,
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
  backgroundColor: COLORS.errorBg,
  border: `1px solid ${COLORS.error}`,
  color: COLORS.errorText,
  borderRadius: '4px',
  padding: '2.4rem',
  marginBottom: '2.4rem',
  marginTop: '2.4rem',
  maxWidth: '60rem',
  width: '100%',
};

const sectionCardStyle: CSSProperties = {
  backgroundColor: COLORS.white,
  border: `1px solid ${COLORS.black}`,
  borderRadius: '4px',
  boxShadow: `6px 6px 0px ${COLORS.black}`,
  padding: '2rem',
  marginTop: '2rem',
  maxWidth: '64.8rem',
  width: '100%',
  textAlign: 'center',
  color: COLORS.grayDark,
};

const getSectionCardStatus = (status: ExecutorStatus): CSSProperties => ({
  ...sectionCardStyle,
  ...(status === 'success'
    ? { borderColor: COLORS.success, boxShadow: `6px 6px 0px ${COLORS.success}` }
    : status === 'error'
      ? { borderColor: COLORS.error, boxShadow: `6px 6px 0px ${COLORS.error}` }
      : {}),
});

const statusMessageStyle: CSSProperties = {
  fontSize: '1.1rem',
  margin: '0.5rem 0',
  color: COLORS.grayDark,
};

const primaryButtonStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: '1rem',
  padding: '0.75rem 1.5rem',
  backgroundColor: COLORS.primary,
  color: COLORS.white,
  border: 'none',
  borderRadius: '4px',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
  letterSpacing: '-0.1px',
};

const retryButtonStyle: CSSProperties = {
  marginTop: '1rem',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  border: `1px solid ${COLORS.error}`,
  background: COLORS.white,
  borderRadius: '4px',
  color: COLORS.error,
  fontWeight: 600,
};

const spinnerStyle: CSSProperties = {
  border: `4px solid ${COLORS.grayLight}`,
  borderTop: `4px solid ${COLORS.primary}`,
  borderRadius: '50%',
  width: '40px',
  height: '40px',
  animation: 'spin 1s linear infinite',
  margin: '1rem auto',
};

const txDescriptionStyle: CSSProperties = {
  fontSize: '0.95rem',
  color: COLORS.grayMid,
  margin: '0.25rem 0',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 0.5rem',
  color: COLORS.grayDark,
  fontSize: '1.1rem',
  fontWeight: 700,
  letterSpacing: '-0.3px',
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

const STATUS_ICONS: Record<StepExecutionStatus, string> = {
  pending: '\u25CB',
  quoting: '\u25D4',
  ready: '\u25D4',
  'switching-chain': '\u25D4',
  confirming: '\u25D4',
  success: '\u2713',
  error: '\u2717',
};

const STATUS_COLORS: Record<StepExecutionStatus, string> = {
  pending: COLORS.offWhite,
  quoting: COLORS.warningBg,
  ready: COLORS.warningBg,
  'switching-chain': COLORS.infoBg,
  confirming: COLORS.infoBg,
  success: COLORS.successBg,
  error: COLORS.errorBg,
};

function StepProgressBar({
  execution,
  workflow,
}: {
  execution: WorkflowExecution;
  workflow: FullWorkflow;
}) {
  return (
    <div style={{ width: '100%', marginTop: '1rem', textAlign: 'left' }}>
      {execution.steps.map((stepExec, i) => {
        const step = workflow.steps[i];
        if (!step) return null;

        const fromChain = CHAIN_NAMES[step.config.fromChain ?? 0] ?? '';
        const toChain = CHAIN_NAMES[step.config.toChain ?? 0] ?? '';
        const isCrossChain = step.config.fromChain !== step.config.toChain;
        const amountLabel = step.config.useAllFromPrevious
          ? 'chained'
          : step.config.amount ?? '?';

        return (
          <div
            key={stepExec.stepId}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              margin: '0.5rem 0',
              backgroundColor: STATUS_COLORS[stepExec.status],
              border: `1px solid ${COLORS.grayLight}`,
              borderRadius: '4px',
              fontSize: '0.95rem',
            }}
          >
            <span style={{ marginRight: '0.75rem', fontSize: '1.2rem' }}>
              {STATUS_ICONS[stepExec.status]}
            </span>
            <span style={{ flex: 1, fontWeight: 500 }}>
              Step {i + 1}: {amountLabel} {step.config.fromToken}
              {isCrossChain ? ` on ${fromChain}` : ''} → {step.config.toToken}
              {isCrossChain ? ` on ${toChain}` : ''}
            </span>
            <span style={{ fontSize: '0.8rem', color: COLORS.grayMid, marginLeft: '0.5rem' }}>
              {stepExec.status}
            </span>
            {stepExec.txHash && (
              <a
                href={getBlockExplorerUrl(stepExec.chainId, stepExec.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: COLORS.primary }}
              >
                View tx
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [workflow, setWorkflow] = useState<FullWorkflow | null>(null);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);

  // ENS state
  const [ensName, setEnsName] = useState<string | null>(null);
  const [ensStatus, setEnsStatus] = useState('');
  const [ensTxHash, setEnsTxHash] = useState<string | null>(null);
  const [loadEnsInput, setLoadEnsInput] = useState('');

  // Ref to allow cancellation of in-progress execution
  const cancelledRef = useRef(false);

  const isMetaMaskReady = isLocalSnap(defaultSnapOrigin)
    ? isFlask
    : snapsDetected;

  const syncWithSnap = useCallback(async () => {
    if (!installedSnap) return;

    const accounts = (await provider?.request({
      method: 'eth_requestAccounts',
    })) as string[] | null;

    if (accounts?.[0]) {
      const ensResult = (await invokeSnap({
        method: 'setUserAddress',
        params: { address: accounts[0] },
      })) as { success: boolean; ens: string | null } | null;

      if (ensResult?.ens) {
        setEnsName(ensResult.ens);
      }
    }

    const wf = (await invokeSnap({
      method: 'getCurrentWorkflow',
    })) as { name: string; steps: unknown[] } | null;

    if (wf) {
      setWorkflowInfo({
        name: wf.name,
        stepCount: wf.steps?.length ?? 0,
      });
    }
  }, [installedSnap, invokeSnap, provider]);

  useEffect(() => {
    syncWithSnap();
  }, [syncWithSnap]);

  // ============================================================
  // CHAIN SWITCHING HELPER
  // ============================================================

  const switchChain = useCallback(
    async (chainId: number) => {
      if (!provider) return;
      const chainIdHex = `0x${chainId.toString(16)}`;
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError: unknown) {
        if ((switchError as { code?: number }).code === 4902) {
          const config = CHAIN_CONFIGS[chainId];
          if (config) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: chainIdHex, ...config }],
            });
          } else {
            throw new Error(
              `Unknown chain ID: ${chainId}. Please add it to MetaMask manually.`,
            );
          }
        } else {
          throw switchError;
        }
      }
    },
    [provider],
  );

  // ============================================================
  // STEP EXECUTION LOOP (reusable for initial run + retry)
  // ============================================================

  const runSteps = useCallback(
    async (
      wf: FullWorkflow,
      exec: WorkflowExecution,
      startFrom: number,
      userAccount: string,
    ) => {
      if (!provider) return;

      let currentExec = exec;

      for (let i = startFrom; i < wf.steps.length; i++) {
        if (cancelledRef.current) return;

        const step = wf.steps[i];
        if (!step) continue;

        const stepLabel = `Step ${i + 1}/${wf.steps.length}`;
        const isCrossChain = step.config.fromChain !== step.config.toChain;
        const fromChain = CHAIN_NAMES[step.config.fromChain ?? 0] ?? '';
        const toChain = CHAIN_NAMES[step.config.toChain ?? 0] ?? '';
        const tokenDesc = `${step.config.fromToken}${isCrossChain ? ` on ${fromChain}` : ''} → ${step.config.toToken}${isCrossChain ? ` on ${toChain}` : ''}`;

        // 1. Quote
        setExecMessage(`${stepLabel}: Fetching quote for ${tokenDesc}...`);
        const updatedStepsQuoting = currentExec.steps.map((s, idx) =>
          idx === i ? { ...s, status: 'quoting' as const } : s,
        );
        currentExec = { ...currentExec, currentStepIndex: i, steps: updatedStepsQuoting };
        setExecution(currentExec);

        await invokeSnap({
          method: 'updateStepStatus',
          params: { stepIndex: i, status: 'quoting' },
        });

        try {
          await invokeSnap({
            method: 'prepareStepQuote',
            params: { stepIndex: i },
          });
        } catch (quoteErr) {
          const msg = quoteErr instanceof Error ? quoteErr.message : String(quoteErr);
          await invokeSnap({
            method: 'updateStepStatus',
            params: { stepIndex: i, status: 'error', error: msg },
          });
          const failedSteps = currentExec.steps.map((s, idx) =>
            idx === i ? { ...s, status: 'error' as const, error: msg } : s,
          );
          setExecution({ ...currentExec, status: 'failed', steps: failedSteps });
          setExecStatus('paused');
          setExecMessage(`${stepLabel} quote failed: ${msg}`);
          return;
        }

        // 2. Get prepared tx
        const txData = (await invokeSnap({
          method: 'getPreparedTransaction',
        })) as PreparedTransaction;

        // 3. Switch chain
        if (txData.chainId) {
          setExecMessage(`${stepLabel}: Switching to ${CHAIN_NAMES[txData.chainId] ?? `chain ${txData.chainId}`}...`);
          const switchSteps = currentExec.steps.map((s, idx) =>
            idx === i ? { ...s, status: 'switching-chain' as const, chainId: txData.chainId } : s,
          );
          currentExec = { ...currentExec, steps: switchSteps };
          setExecution(currentExec);

          await invokeSnap({
            method: 'updateStepStatus',
            params: { stepIndex: i, status: 'switching-chain' },
          });

          try {
            await switchChain(txData.chainId);
          } catch (switchErr) {
            const msg = switchErr instanceof Error ? switchErr.message : String(switchErr);
            await invokeSnap({
              method: 'updateStepStatus',
              params: { stepIndex: i, status: 'error', error: msg },
            });
            const failedSteps = currentExec.steps.map((s, idx) =>
              idx === i ? { ...s, status: 'error' as const, error: msg } : s,
            );
            setExecution({ ...currentExec, status: 'failed', steps: failedSteps });
            setExecStatus('paused');
            setExecMessage(`${stepLabel} chain switch failed: ${msg}`);
            return;
          }
        }

        // 4. Send transaction
        setExecMessage(`${stepLabel}: Confirm ${tokenDesc} in MetaMask...`);
        const confirmSteps = currentExec.steps.map((s, idx) =>
          idx === i ? { ...s, status: 'confirming' as const } : s,
        );
        currentExec = { ...currentExec, steps: confirmSteps };
        setExecution(currentExec);

        await invokeSnap({
          method: 'updateStepStatus',
          params: { stepIndex: i, status: 'confirming' },
        });

        let hash: string;
        try {
          hash = (await provider.request({
            method: 'eth_sendTransaction',
            params: [
              {
                from: userAccount,
                to: txData.to,
                value: txData.value,
                data: txData.data,
              },
            ],
          })) as string;
        } catch (txErr) {
          const msg = txErr instanceof Error ? txErr.message : String(txErr);
          await invokeSnap({
            method: 'updateStepStatus',
            params: { stepIndex: i, status: 'error', error: msg },
          });
          const failedSteps = currentExec.steps.map((s, idx) =>
            idx === i ? { ...s, status: 'error' as const, error: msg } : s,
          );
          setExecution({ ...currentExec, status: 'failed', steps: failedSteps });
          setExecStatus('paused');
          setExecMessage(`${stepLabel} transaction failed: ${msg}`);
          return;
        }

        // 5. Mark success
        await invokeSnap({
          method: 'updateStepStatus',
          params: { stepIndex: i, status: 'success', txHash: hash },
        });
        await invokeSnap({ method: 'clearPreparedTransaction' });

        const successSteps = currentExec.steps.map((s, idx) =>
          idx === i
            ? { ...s, status: 'success' as const, txHash: hash, chainId: txData.chainId }
            : s,
        );
        currentExec = {
          ...currentExec,
          currentStepIndex: i + 1,
          steps: successSteps,
        };
        setExecution(currentExec);
      }

      // All steps done
      setExecution((prev) =>
        prev ? { ...prev, status: 'completed' } : null,
      );
      setExecStatus('success');
      setExecMessage(
        `Workflow "${wf.name}" completed! All ${wf.steps.length} steps executed.`,
      );
    },
    [provider, invokeSnap, switchChain],
  );

  // ============================================================
  // EXECUTE WORKFLOW
  // ============================================================

  const executeWorkflow = useCallback(async () => {
    if (!provider) return;
    cancelledRef.current = false;

    try {
      // 1. Get accounts
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts?.[0]) {
        setExecStatus('error');
        setExecMessage('No wallet accounts found. Please connect MetaMask.');
        return;
      }

      await invokeSnap({
        method: 'setUserAddress',
        params: { address: accounts[0] },
      });

      // 2. Load workflow
      setExecStatus('loading-workflow');
      setExecMessage('Loading workflow from Surecast...');

      const wf = (await invokeSnap({
        method: 'getCurrentWorkflow',
      })) as FullWorkflow | null;

      if (!wf || wf.steps.length === 0) {
        setExecStatus('error');
        setExecMessage(
          'No workflow with steps found. Build one in the Surecast snap first.',
        );
        return;
      }
      setWorkflow(wf);

      // 3. Initialize execution
      const { execution: exec } = (await invokeSnap({
        method: 'startExecution',
      })) as { execution: WorkflowExecution };

      setExecution(exec);
      setExecStatus('executing');

      // 4. Run all steps
      await runSteps(wf, exec, 0, accounts[0]);
    } catch (err: unknown) {
      setExecStatus('error');
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred';
      setExecMessage(errorMessage);
      console.error('Workflow execution error:', err);
    }
  }, [provider, invokeSnap, runSteps]);

  // ============================================================
  // RETRY FROM FAILED STEP
  // ============================================================

  const retryFromStep = useCallback(async () => {
    if (!provider || !workflow || !execution) return;
    cancelledRef.current = false;

    const failedIdx = execution.steps.findIndex(
      (s) => s.status !== 'success',
    );
    if (failedIdx === -1) return;

    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (!accounts?.[0]) return;

      // Reset the failed step
      await invokeSnap({
        method: 'updateStepStatus',
        params: { stepIndex: failedIdx, status: 'pending' },
      });

      const resetSteps = execution.steps.map((s, idx) =>
        idx >= failedIdx ? { ...s, status: 'pending' as const, error: null, txHash: null } : s,
      );
      const resetExec: WorkflowExecution = {
        ...execution,
        status: 'running',
        steps: resetSteps,
      };
      setExecution(resetExec);
      setExecStatus('executing');

      await runSteps(workflow, resetExec, failedIdx, accounts[0]);
    } catch (err: unknown) {
      setExecStatus('error');
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred';
      setExecMessage(errorMessage);
    }
  }, [provider, invokeSnap, workflow, execution, runSteps]);

  // ============================================================
  // ENS: SAVE WORKFLOW TO ENS
  // ============================================================

  const saveToEns = useCallback(async () => {
    if (!provider || !ensName) return;

    setEnsStatus('Preparing ENS transaction...');
    setEnsTxHash(null);

    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (!accounts?.[0]) {
        setEnsStatus('No wallet accounts found.');
        return;
      }

      // Compute namehash on site side (keccak256 available here, not in snap SES)
      const node = namehash(ensName);

      // Tell snap to prepare the setText transaction
      await invokeSnap({
        method: 'prepareEnsSave',
        params: { namehash: node },
      });

      // Get the prepared transaction
      const txData = (await invokeSnap({
        method: 'getPreparedTransaction',
      })) as PreparedTransaction;

      // Switch to mainnet for ENS
      setEnsStatus('Switching to Ethereum mainnet...');
      await switchChain(1);

      // Send the transaction
      setEnsStatus('Confirm setText transaction in MetaMask...');
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

      await invokeSnap({ method: 'clearPreparedTransaction' });

      setEnsTxHash(hash);
      setEnsStatus(`Saved to ${ensName}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`ENS save failed: ${msg}`);
    }
  }, [provider, ensName, invokeSnap, switchChain]);

  // ============================================================
  // ENS: LOAD WORKFLOW FROM ENS
  // ============================================================

  const loadFromEns = useCallback(async (name: string) => {
    if (!provider || !name) return;

    setEnsStatus(`Loading workflow from ${name}...`);
    setEnsTxHash(null);

    try {
      // Switch to mainnet for the eth_call
      await switchChain(1);

      // Compute namehash and encode the text() call
      const node = namehash(name);
      const callData = encodeGetText(node, ENS_WORKFLOW_KEY);

      // Read the text record via eth_call (free, no gas)
      const result = (await provider.request({
        method: 'eth_call',
        params: [
          { to: ENS_PUBLIC_RESOLVER, data: callData },
          'latest',
        ],
      })) as string;

      const workflowJson = decodeTextResult(result);

      if (!workflowJson) {
        setEnsStatus(`No workflow found on ${name}.`);
        return;
      }

      // Import into snap
      await invokeSnap({
        method: 'importWorkflow',
        params: { workflowJson },
      });

      // Refresh UI
      await syncWithSnap();
      setEnsStatus(`Loaded workflow from ${name}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`ENS load failed: ${msg}`);
    }
  }, [provider, invokeSnap, switchChain, syncWithSnap]);

  // ============================================================
  // RESET
  // ============================================================

  const resetExecutor = useCallback(() => {
    cancelledRef.current = true;
    setExecStatus('idle');
    setExecMessage('');
    setWorkflow(null);
    setExecution(null);
    syncWithSnap();
  }, [syncWithSnap]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div style={containerStyle}>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <h1 style={headingStyle}>
        Welcome to <span style={{ color: COLORS.primary }}>Surecast</span>
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
          <div style={{
            ...sectionCardStyle,
            backgroundColor: COLORS.infoBg,
            borderColor: COLORS.primary,
            boxShadow: `6px 6px 0px ${COLORS.primary}`,
            textAlign: 'left',
          }}>
            <h3 style={sectionTitleStyle}>Current Workflow</h3>
            <p style={{ margin: '0.25rem 0', fontSize: '1rem', fontWeight: 500 }}>
              {workflowInfo.name}
            </p>
            <p style={txDescriptionStyle}>
              {workflowInfo.stepCount} step{workflowInfo.stepCount === 1 ? '' : 's'} — Open the Surecast home in MetaMask to edit.
            </p>
          </div>
        )}
      </div>

      {/* Executor Section */}
      {installedSnap && (
        <div style={getSectionCardStatus(execStatus)}>
          <h3 style={sectionTitleStyle}>Workflow Executor</h3>

          {execStatus === 'idle' && (
            <>
              <p style={statusMessageStyle}>
                Build a workflow in the Surecast snap, then execute all steps
                here.
              </p>
              {workflowInfo && (
                <p style={txDescriptionStyle}>
                  Ready: &quot;{workflowInfo.name}&quot; with{' '}
                  {workflowInfo.stepCount} step
                  {workflowInfo.stepCount === 1 ? '' : 's'}
                </p>
              )}
              <button style={primaryButtonStyle} onClick={executeWorkflow}>
                Execute Workflow
              </button>
            </>
          )}

          {execStatus === 'loading-workflow' && (
            <>
              <div style={spinnerStyle} />
              <p style={statusMessageStyle}>{execMessage}</p>
            </>
          )}

          {execStatus === 'executing' && (
            <>
              <div style={spinnerStyle} />
              <p style={statusMessageStyle}>{execMessage}</p>
              {execution && workflow && (
                <StepProgressBar execution={execution} workflow={workflow} />
              )}
            </>
          )}

          {execStatus === 'paused' && (
            <>
              <p style={statusMessageStyle}>{execMessage}</p>
              {execution && workflow && (
                <StepProgressBar execution={execution} workflow={workflow} />
              )}
              <button style={primaryButtonStyle} onClick={retryFromStep}>
                Retry from failed step
              </button>
              <button
                style={{ ...retryButtonStyle, marginLeft: '0.5rem' }}
                onClick={resetExecutor}
              >
                Cancel
              </button>
            </>
          )}

          {execStatus === 'success' && (
            <>
              <p style={statusMessageStyle}>{execMessage}</p>
              {execution && workflow && (
                <StepProgressBar execution={execution} workflow={workflow} />
              )}
              <button
                style={{ ...primaryButtonStyle, marginTop: '1rem' }}
                onClick={resetExecutor}
              >
                Execute Another Workflow
              </button>
            </>
          )}

          {execStatus === 'error' && (
            <>
              <p style={statusMessageStyle}>{execMessage}</p>
              <button style={retryButtonStyle} onClick={resetExecutor}>
                Reset
              </button>
            </>
          )}
        </div>
      )}

      {/* ENS Section */}
      {installedSnap && (
        <div style={{
          ...sectionCardStyle,
          marginTop: '1.5rem',
          ...(ensTxHash
            ? { borderColor: COLORS.success, boxShadow: `6px 6px 0px ${COLORS.success}` }
            : ensStatus.includes('failed')
              ? { borderColor: COLORS.error, boxShadow: `6px 6px 0px ${COLORS.error}` }
              : {}),
        }}>
          <h3 style={sectionTitleStyle}>ENS Workflow Sharing</h3>

          {ensName ? (
            <p style={txDescriptionStyle}>
              Your ENS: <strong>{ensName}</strong>
            </p>
          ) : (
            <p style={txDescriptionStyle}>
              No ENS name detected. Connect a wallet with an ENS name to save workflows on-chain.
            </p>
          )}

          {ensName && workflowInfo && (
            <button
              style={primaryButtonStyle}
              onClick={saveToEns}
            >
              Save Workflow to ENS
            </button>
          )}

          <div style={{ marginTop: '1rem' }}>
            <p style={txDescriptionStyle}>Load a workflow from any ENS name:</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="vitalik.eth"
                value={loadEnsInput}
                onChange={(e) => setLoadEnsInput(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${COLORS.grayLight}`,
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  width: '200px',
                  fontFamily: 'inherit',
                }}
              />
              <button
                style={{
                  ...primaryButtonStyle,
                  marginTop: 0,
                  opacity: loadEnsInput ? 1 : 0.5,
                }}
                onClick={() => loadFromEns(loadEnsInput)}
                disabled={!loadEnsInput}
              >
                Load
              </button>
            </div>
          </div>

          {ensStatus && (
            <p style={{ ...statusMessageStyle, marginTop: '0.75rem' }}>
              {ensStatus}
            </p>
          )}

          {ensTxHash && (
            <a
              href={getBlockExplorerUrl(1, ensTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.9rem', color: COLORS.primary, fontWeight: 500 }}
            >
              View transaction on Etherscan
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;
