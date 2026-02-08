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
import {
  lookupEnsName,
  computeNamehash,
  slugify,
  getWorkflowKey,
} from '../utils/ens';

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
// LOCAL STORAGE PERSISTENCE
// ============================================================

const LOCAL_STORAGE_KEY = 'surecast-workflow';

function saveToLocal(workflowData: FullWorkflow): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(workflowData));
  } catch {
    // localStorage may be full or unavailable
  }
}

function loadFromLocal(): FullWorkflow | null {
  try {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY);
    return json ? (JSON.parse(json) as FullWorkflow) : null;
  } catch {
    return null;
  }
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
  const [savedCount, setSavedCount] = useState(0);

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
  const [loadEnsSlug, setLoadEnsSlug] = useState('');
  const [ensSlugPreview, setEnsSlugPreview] = useState<string | null>(null);
  const [pendingEnsTx, setPendingEnsTx] = useState<PreparedTransaction | null>(null);

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
      // Reverse lookup for ENS name
      let ens: string | null = null;
      try {
        ens = await lookupEnsName(accounts[0]);
        if (ens) setEnsName(ens);
      } catch {
        // ENS reverse lookup is best-effort
      }

      // Set address + namehash in snap (namehash needed for ENS save from snap)
      await invokeSnap({
        method: 'setUserAddress',
        params: {
          address: accounts[0],
          ...(ens ? { namehash: computeNamehash(ens) } : {}),
        },
      });
    }

    let currentWorkflow = (await invokeSnap({
      method: 'getCurrentWorkflow',
    })) as FullWorkflow | null;

    // If snap has no workflow, try restoring from localStorage
    if (!currentWorkflow) {
      const localWorkflow = loadFromLocal();
      if (localWorkflow && localWorkflow.steps.length > 0) {
        await invokeSnap({
          method: 'importWorkflow',
          params: { workflowJson: JSON.stringify(localWorkflow) },
        });
        currentWorkflow = localWorkflow;
      }
    }

    if (currentWorkflow) {
      setWorkflowInfo({
        name: currentWorkflow.name,
        stepCount: currentWorkflow.steps?.length ?? 0,
      });
      setEnsSlugPreview(slugify(currentWorkflow.name));
      saveToLocal(currentWorkflow);
    }

    // Fetch saved workflow count
    try {
      const saved = (await invokeSnap({
        method: 'getSavedWorkflows',
      })) as unknown[] | null;
      setSavedCount(saved?.length ?? 0);
    } catch {
      // best-effort
    }

    // Check for pending ENS save (prepared from snap UI)
    try {
      const pendingTx = (await invokeSnap({
        method: 'getPreparedTransaction',
      })) as PreparedTransaction | null;
      if (pendingTx && (pendingTx as PreparedTransaction & { type?: string }).type === 'ens-write') {
        setPendingEnsTx(pendingTx);
        setEnsStatus(pendingTx.description ?? 'Pending ENS save — confirm below.');
      }
    } catch {
      // best-effort
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

  const saveToEns = useCallback(async (workflowSlug?: string) => {
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

      // Compute namehash on site side (with normalization via viem)
      const node = computeNamehash(ensName);

      // Tell snap to prepare the setText transaction with slug
      const ensKey = workflowSlug ? getWorkflowKey(workflowSlug) : undefined;
      setEnsStatus(`Saving as ${ensKey ?? 'auto-slug'}...`);

      await invokeSnap({
        method: 'prepareEnsSave',
        params: {
          namehash: node,
          ...(workflowSlug ? { slug: workflowSlug } : {}),
        },
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
  // ENS: CONFIRM PENDING ENS SAVE (prepared from snap UI)
  // ============================================================

  const confirmPendingEnsTx = useCallback(async () => {
    if (!provider || !pendingEnsTx) return;

    setEnsStatus('Switching to Ethereum mainnet...');
    setEnsTxHash(null);

    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (!accounts?.[0]) {
        setEnsStatus('No wallet accounts found.');
        return;
      }

      await switchChain(1);

      setEnsStatus('Confirm setText transaction in MetaMask...');
      const hash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: accounts[0],
            to: pendingEnsTx.to,
            value: pendingEnsTx.value,
            data: pendingEnsTx.data,
          },
        ],
      })) as string;

      await invokeSnap({ method: 'clearPreparedTransaction' });
      setPendingEnsTx(null);
      setEnsTxHash(hash);
      setEnsStatus('Saved to ENS!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`ENS save failed: ${msg}`);
    }
  }, [provider, pendingEnsTx, invokeSnap, switchChain]);

  // ============================================================
  // ENS: LOAD WORKFLOW FROM ENS
  // ============================================================

  const loadFromEns = useCallback(async (ensOwner: string, workflowSlug: string) => {
    if (!ensOwner) return;

    setEnsStatus(`Loading from ${ensOwner}...`);
    setEnsTxHash(null);

    try {
      // Compute namehash on site (snap can't use keccak256 in SES)
      const namehash = computeNamehash(ensOwner);

      // Single RPC call: snap fetches ENS, deserializes, sets as current
      const imported = (await invokeSnap({
        method: 'loadFromEns',
        params: {
          namehash,
          ...(workflowSlug ? { slug: workflowSlug } : {}),
        },
      })) as FullWorkflow;

      // Update local state directly — no syncWithSnap round-trip needed
      setWorkflowInfo({
        name: imported.name,
        stepCount: imported.steps?.length ?? 0,
      });
      setEnsSlugPreview(slugify(imported.name));
      saveToLocal(imported);
      setEnsStatus(`Loaded workflow from ${ensOwner}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`ENS load failed: ${msg}`);
    }
  }, [invokeSnap]);

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
            {savedCount > 0 && (
              <p style={{ ...txDescriptionStyle, fontSize: '0.85rem' }}>
                {savedCount} saved workflow{savedCount === 1 ? '' : 's'} in snap
              </p>
            )}
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

          {pendingEnsTx && (
            <div style={{
              backgroundColor: COLORS.warningBg,
              border: `1px solid ${COLORS.primary}`,
              borderRadius: '4px',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'left',
            }}>
              <p style={{ ...statusMessageStyle, fontWeight: 600, margin: 0 }}>
                {pendingEnsTx.description ?? 'Pending ENS save'}
              </p>
              <button
                style={{ ...primaryButtonStyle, marginTop: '0.5rem' }}
                onClick={confirmPendingEnsTx}
              >
                Confirm ENS Save
              </button>
              <button
                style={{ ...retryButtonStyle, marginLeft: '0.5rem', marginTop: '0.5rem' }}
                onClick={async () => {
                  await invokeSnap({ method: 'clearPreparedTransaction' });
                  setPendingEnsTx(null);
                  setEnsStatus('');
                }}
              >
                Dismiss
              </button>
            </div>
          )}

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
            <div style={{ marginTop: '0.5rem' }}>
              <p style={txDescriptionStyle}>
                Current: <strong>{workflowInfo.name}</strong>
                {ensSlugPreview && (
                  <span style={{ color: COLORS.grayMid }}>
                    {` → ${getWorkflowKey(ensSlugPreview)}`}
                  </span>
                )}
              </p>
              <button
                style={primaryButtonStyle}
                onClick={() => saveToEns(ensSlugPreview ?? undefined)}
              >
                Save Current Workflow to ENS
              </button>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <p style={txDescriptionStyle}>Load a workflow from any ENS name:</p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
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
                    width: '180px',
                    fontFamily: 'inherit',
                  }}
                />
                <input
                  type="text"
                  placeholder="workflow-slug (optional)"
                  value={loadEnsSlug}
                  onChange={(e) => setLoadEnsSlug(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: `1px solid ${COLORS.grayLight}`,
                    borderRadius: '4px',
                    fontSize: '0.95rem',
                    width: '180px',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              {loadEnsSlug && (
                <p style={{ ...txDescriptionStyle, fontSize: '0.8rem', margin: 0 }}>
                  Key: {getWorkflowKey(loadEnsSlug)}
                </p>
              )}
              <button
                style={{
                  ...primaryButtonStyle,
                  marginTop: 0,
                  opacity: loadEnsInput ? 1 : 0.5,
                }}
                onClick={() => loadFromEns(loadEnsInput, loadEnsSlug)}
                disabled={!loadEnsInput}
              >
                Load from ENS
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
