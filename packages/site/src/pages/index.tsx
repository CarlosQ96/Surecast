import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import {
  ConnectButton,
  InstallFlaskButton,
  ReconnectButton,
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
  readEnsText,
  slugify,
  getWorkflowKey,
  ENS_MANIFEST_KEY,
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

interface QuoteInfo {
  gasUsd: string;
  estimatedSeconds: number;
  toAmount: string;
  toAmountMin: string;
  toSymbol: string;
  toDecimals: number;
  slippagePercent: number;
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
// ENS MANIFEST (localStorage-backed list of saved ENS workflows)
// ============================================================

type EnsManifestEntry = { slug: string; name: string };

function getManifestKey(ensName: string): string {
  return `surecast-ens-manifest:${ensName.toLowerCase()}`;
}

function getLocalManifest(ensName: string): EnsManifestEntry[] {
  try {
    const json = localStorage.getItem(getManifestKey(ensName));
    return json ? (JSON.parse(json) as EnsManifestEntry[]) : [];
  } catch {
    return [];
  }
}

function addToLocalManifest(
  ensName: string,
  slug: string,
  name: string,
): EnsManifestEntry[] {
  const entries = getLocalManifest(ensName);
  const existingIdx = entries.findIndex((entry) => entry.slug === slug);
  if (existingIdx >= 0) {
    entries[existingIdx] = { slug, name };
  } else {
    entries.push({ slug, name });
  }
  try {
    localStorage.setItem(getManifestKey(ensName), JSON.stringify(entries));
  } catch {
    // localStorage may be full
  }
  return entries;
}

function deserializeManifest(json: string): EnsManifestEntry[] {
  const parsed = JSON.parse(json) as string[][];
  return parsed.map(([slug, name]) => ({ slug: slug ?? '', name: name ?? '' }));
}

function getCheckedKey(ensName: string): string {
  return `surecast-ens-checked:${ensName.toLowerCase()}`;
}

function wasManifestChecked(ensName: string): boolean {
  try {
    return localStorage.getItem(getCheckedKey(ensName)) === '1';
  } catch {
    return false;
  }
}

function markManifestChecked(ensName: string): void {
  try {
    localStorage.setItem(getCheckedKey(ensName), '1');
  } catch {
    // localStorage may be full
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
  primary: '#D63384',
  primaryHover: '#E24A9E',
  accent: '#3F49E1',
  white: '#FFFFFF',
  offWhite: '#F9F9FB',
  grayLight: '#E8E8EF',
  grayMid: '#6B7280',
  grayDark: '#1F2937',
  success: '#10B981',
  successBg: '#ECFDF5',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  errorText: '#991B1B',
  warningBg: '#FFFBEB',
  infoBg: '#EFF4FF',
};

// ============================================================
// INLINE STYLES
// ============================================================

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: 1,
  marginTop: '4rem',
  marginBottom: '4rem',
  padding: '0 2rem',
  maxWidth: '720px',
  marginLeft: 'auto',
  marginRight: 'auto',
  width: '100%',
  boxSizing: 'border-box',
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

const errorMessageStyle: CSSProperties = {
  backgroundColor: COLORS.errorBg,
  border: `1px solid ${COLORS.error}`,
  color: COLORS.errorText,
  borderRadius: '12px',
  padding: '2.4rem',
  marginBottom: '2.4rem',
  marginTop: '2.4rem',
  maxWidth: '60rem',
  width: '100%',
};

const sectionCardStyle: CSSProperties = {
  backgroundColor: COLORS.white,
  border: `1px solid ${COLORS.grayLight}`,
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
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
    ? { borderColor: COLORS.success }
    : status === 'error'
      ? { borderColor: COLORS.error }
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
  borderRadius: '8px',
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
  borderRadius: '8px',
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
  quoteInfos,
}: {
  execution: WorkflowExecution;
  workflow: FullWorkflow;
  quoteInfos: Record<number, QuoteInfo>;
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
        const quote = quoteInfos[i];
        const highSlippage = quote && quote.slippagePercent > 2;

        return (
          <div
            key={stepExec.stepId}
            style={{
              padding: '0.75rem 1rem',
              margin: '0.5rem 0',
              backgroundColor: STATUS_COLORS[stepExec.status],
              border: `1px solid ${highSlippage ? COLORS.error : COLORS.grayLight}`,
              borderRadius: '8px',
              fontSize: '0.95rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '0.75rem', fontSize: '1.2rem' }}>
                {STATUS_ICONS[stepExec.status]}
              </span>
              <span style={{ flex: 1, fontWeight: 500 }}>
                Step {i + 1}: {amountLabel} {step.config.fromToken}
                {isCrossChain ? ` on ${fromChain}` : ''} → {step.config.toToken}
                {isCrossChain ? ` on ${toChain}` : ''}
                {step.config.protocol ? ` (${step.config.protocol})` : ''}
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
            {quote && (
              <div style={{
                display: 'flex',
                gap: '1rem',
                marginTop: '0.4rem',
                marginLeft: '2.15rem',
                fontSize: '0.8rem',
                color: COLORS.grayMid,
              }}>
                <span>Gas: ~${quote.gasUsd}</span>
                <span>~{quote.estimatedSeconds}s</span>
                <span style={highSlippage ? { color: COLORS.error, fontWeight: 600 } : {}}>
                  Slippage: {quote.slippagePercent.toFixed(1)}%
                  {highSlippage ? ' ⚠' : ''}
                </span>
              </div>
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
  const [quoteInfos, setQuoteInfos] = useState<Record<number, QuoteInfo>>({});

  // ENS state
  const [ensName, setEnsName] = useState<string | null>(null);
  const [ensStatus, setEnsStatus] = useState('');
  const [ensTxHash, setEnsTxHash] = useState<string | null>(null);
  const [loadEnsInput, setLoadEnsInput] = useState('');
  const [loadEnsSlug, setLoadEnsSlug] = useState('');
  const [ensSlugPreview, setEnsSlugPreview] = useState<string | null>(null);
  const [pendingEnsTx, setPendingEnsTx] = useState<PreparedTransaction | null>(null);
  const [myEnsWorkflows, setMyEnsWorkflows] = useState<EnsManifestEntry[]>([]);
  const [manualEnsInput, setManualEnsInput] = useState('');

  // Ref to allow cancellation of in-progress execution
  const cancelledRef = useRef(false);

  const isMetaMaskReady = isLocalSnap(defaultSnapOrigin)
    ? isFlask
    : snapsDetected;

  const syncWithSnap = useCallback(async () => {
    if (!installedSnap) return;

    let ens: string | null = null;

    const accounts = (await provider?.request({
      method: 'eth_requestAccounts',
    })) as string[] | null;

    if (accounts?.[0]) {
      // Reverse lookup for ENS name
      try {
        ens = await lookupEnsName(accounts[0]);
        if (ens) {
          setEnsName(ens);
          // Load manifest from localStorage (instant, no RPCs)
          const localManifest = getLocalManifest(ens);
          setMyEnsWorkflows(localManifest);

          // Auto-refresh from on-chain if localStorage manifest is empty and not yet checked
          if (localManifest.length === 0 && !wasManifestChecked(ens)) {
            try {
              const manifestJson = await readEnsText(ens, ENS_MANIFEST_KEY);
              if (manifestJson) {
                const entries = deserializeManifest(manifestJson);
                for (const entry of entries) {
                  addToLocalManifest(ens, entry.slug, entry.name);
                }
                setMyEnsWorkflows(getLocalManifest(ens));
              }
            } catch {
              // best-effort — manifest read can fail
            }
            markManifestChecked(ens);
          }
        }
      } catch {
        // ENS reverse lookup is best-effort
      }

      // Set address + namehash + ens name in snap
      const setUserResult = (await invokeSnap({
        method: 'setUserAddress',
        params: {
          address: accounts[0],
          ...(ens ? { namehash: computeNamehash(ens), ens } : {}),
        },
      })) as { ens?: string | null } | null;

      // Fallback: snap may detect ENS via ensideas.com when on-chain reverse lookup fails
      if (!ens && setUserResult?.ens) {
        ens = setUserResult.ens;
        setEnsName(ens);
        const localManifest = getLocalManifest(ens);
        setMyEnsWorkflows(localManifest);

        if (localManifest.length === 0 && !wasManifestChecked(ens)) {
          try {
            const manifestJson = await readEnsText(ens, ENS_MANIFEST_KEY);
            if (manifestJson) {
              const entries = deserializeManifest(manifestJson);
              for (const entry of entries) {
                addToLocalManifest(ens, entry.slug, entry.name);
              }
              setMyEnsWorkflows(getLocalManifest(ens));
            }
          } catch {
            // best-effort
          }
          markManifestChecked(ens);
        }
      }
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

      if (pendingTx) {
        const txType = (pendingTx as PreparedTransaction & { type?: string }).type;

        if (txType === 'ens-save-request') {
          // Snap queued a save request — site completes it with namehash
          // Try local ens first, then snap's stored ens as fallback
          let resolvedEns = ens;
          if (!resolvedEns) {
            try {
              const snapState = (await invokeSnap({ method: 'getState' })) as { userEns?: string } | null;
              if (snapState?.userEns) {
                resolvedEns = snapState.userEns;
                setEnsName(resolvedEns);
              }
            } catch {
              // best-effort
            }
          }

          if (resolvedEns) {
            const node = computeNamehash(resolvedEns);
            let currentManifest: string | null = null;
            try {
              currentManifest = await readEnsText(resolvedEns, ENS_MANIFEST_KEY);
            } catch {
              // start fresh
            }
            await invokeSnap({
              method: 'prepareEnsSave',
              params: {
                namehash: node,
                ...(currentManifest ? { manifest: currentManifest } : {}),
              },
            });
            // Re-read the now-complete prepared tx
            const completedTx = (await invokeSnap({
              method: 'getPreparedTransaction',
            })) as PreparedTransaction | null;
            if (completedTx) {
              setPendingEnsTx(completedTx);
              setEnsStatus(completedTx.description ?? 'ENS save ready — confirm below.');
            }
          } else {
            // No ENS available — show the request description so user knows it's pending
            setEnsStatus(`${pendingTx.description ?? 'ENS save pending'} — no ENS name detected.`);
          }
        } else if (txType === 'ens-write') {
          setPendingEnsTx(pendingTx);
          setEnsStatus(pendingTx.description ?? 'Pending ENS save — confirm below.');
        }
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
          const quoteResult = (await invokeSnap({
            method: 'prepareStepQuote',
            params: { stepIndex: i },
          })) as {
            gasUsd: string;
            estimatedSeconds: number;
            toAmount: string;
            toAmountMin: string;
            toSymbol: string;
            toDecimals: number;
          } | null;

          if (quoteResult) {
            const toAmtNum = parseFloat(quoteResult.toAmount);
            const toMinNum = parseFloat(quoteResult.toAmountMin);
            const slippagePercent =
              toAmtNum > 0 ? ((toAmtNum - toMinNum) / toAmtNum) * 100 : 0;

            setQuoteInfos((prev) => ({
              ...prev,
              [i]: {
                gasUsd: quoteResult.gasUsd,
                estimatedSeconds: quoteResult.estimatedSeconds,
                toAmount: quoteResult.toAmount,
                toAmountMin: quoteResult.toAmountMin,
                toSymbol: quoteResult.toSymbol,
                toDecimals: quoteResult.toDecimals,
                slippagePercent,
              },
            }));
          }
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

      // Compute namehash on site side
      const node = computeNamehash(ensName);

      // Read current manifest from ENS directly (site-side, no snap RPC)
      let currentManifest: string | null = null;
      try {
        currentManifest = await readEnsText(ensName, ENS_MANIFEST_KEY);
      } catch {
        // start fresh if read fails
      }

      const ensKey = workflowSlug ? getWorkflowKey(workflowSlug) : undefined;
      setEnsStatus(`Saving as ${ensKey ?? 'auto-slug'}...`);

      // Pass manifest to snap so it can build multicall (workflow + manifest update)
      await invokeSnap({
        method: 'prepareEnsSave',
        params: {
          namehash: node,
          ...(workflowSlug ? { slug: workflowSlug } : {}),
          ...(currentManifest ? { manifest: currentManifest } : {}),
        },
      });

      // Get the prepared transaction
      const txData = (await invokeSnap({
        method: 'getPreparedTransaction',
      })) as PreparedTransaction;

      // Switch to mainnet for ENS
      setEnsStatus('Switching to Ethereum mainnet...');
      await switchChain(1);

      // Send the transaction (multicall: workflow + manifest in one tx)
      setEnsStatus('Confirm transaction in MetaMask...');
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

      // Update local manifest (instant, no RPCs)
      const saveName = workflowInfo?.name ?? 'Untitled';
      const saveSlug = workflowSlug ?? slugify(saveName);
      const updatedManifest = addToLocalManifest(ensName, saveSlug, saveName);
      setMyEnsWorkflows(updatedManifest);

      setEnsTxHash(hash);
      setEnsStatus(`Saved to ${ensName}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`ENS save failed: ${msg}`);
    }
  }, [provider, ensName, invokeSnap, switchChain, workflowInfo]);

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

  // Load a workflow from your own ENS by slug (site reads directly, 1 snap RPC to import)
  const loadMyEnsWorkflow = useCallback(async (slug: string) => {
    if (!ensName) return;

    setEnsStatus(`Loading "${slug}" from ${ensName}...`);
    setEnsTxHash(null);

    try {
      const ensKey = getWorkflowKey(slug);
      const workflowJson = await readEnsText(ensName, ensKey);
      if (!workflowJson) {
        setEnsStatus(`No workflow found at ${ensKey}`);
        return;
      }

      // Import into snap via existing RPC (1 call)
      const imported = (await invokeSnap({
        method: 'importWorkflow',
        params: { workflowJson },
      })) as FullWorkflow;

      setWorkflowInfo({
        name: imported.name,
        stepCount: imported.steps?.length ?? 0,
      });
      setEnsSlugPreview(slugify(imported.name));
      saveToLocal(imported);
      setEnsStatus(`Loaded "${imported.name}" from ${ensName}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`Load failed: ${msg}`);
    }
  }, [ensName, invokeSnap]);

  // Refresh manifest from on-chain ENS (recovery if localStorage is lost)
  const refreshEnsManifest = useCallback(async () => {
    if (!ensName) return;

    setEnsStatus('Reading manifest from ENS...');
    try {
      const manifestJson = await readEnsText(ensName, ENS_MANIFEST_KEY);
      if (manifestJson) {
        const entries = deserializeManifest(manifestJson);
        // Save to localStorage for future use
        for (const entry of entries) {
          addToLocalManifest(ensName, entry.slug, entry.name);
        }
        setMyEnsWorkflows(getLocalManifest(ensName));
        setEnsStatus(`Found ${entries.length} workflow${entries.length === 1 ? '' : 's'} on ENS.`);
      } else {
        setEnsStatus('No workflow manifest found on ENS.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEnsStatus(`Manifest refresh failed: ${msg}`);
    }
  }, [ensName]);

  // Set ENS name manually (when reverse lookup fails)
  const setEnsManually = useCallback(async (name: string) => {
    if (!name || !name.includes('.')) return;

    setEnsName(name);
    setManualEnsInput('');
    setEnsStatus(`ENS set to ${name}`);

    // Pass to snap
    try {
      const accounts = (await provider?.request({
        method: 'eth_requestAccounts',
      })) as string[] | null;
      if (accounts?.[0]) {
        await invokeSnap({
          method: 'setUserAddress',
          params: {
            address: accounts[0],
            namehash: computeNamehash(name),
            ens: name,
          },
        });
      }
    } catch {
      // best-effort
    }

    // Fetch manifest from on-chain
    const localManifest = getLocalManifest(name);
    setMyEnsWorkflows(localManifest);
    if (localManifest.length === 0 && !wasManifestChecked(name)) {
      try {
        const manifestJson = await readEnsText(name, ENS_MANIFEST_KEY);
        if (manifestJson) {
          const entries = deserializeManifest(manifestJson);
          for (const entry of entries) {
            addToLocalManifest(name, entry.slug, entry.name);
          }
          setMyEnsWorkflows(getLocalManifest(name));
          setEnsStatus(`${name} — found ${entries.length} workflow${entries.length === 1 ? '' : 's'}`);
        }
      } catch {
        // best-effort
      }
      markManifestChecked(name);
    }
  }, [provider, invokeSnap]);

  // ============================================================
  // RESET
  // ============================================================

  const resetExecutor = useCallback(() => {
    cancelledRef.current = true;
    setExecStatus('idle');
    setExecMessage('');
    setWorkflow(null);
    setExecution(null);
    setQuoteInfos({});
    syncWithSnap();
  }, [syncWithSnap]);

  // ============================================================
  // RENDER
  // ============================================================

  const isConnected = Boolean(installedSnap);

  return (
    <div style={containerStyle}>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>

      {error && (
        <div style={errorMessageStyle}>
          <b>An error happened:</b> {error.message}
        </div>
      )}

      {/* ===== DISCONNECTED STATE: Hero ===== */}
      {!isConnected && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <h1 style={{ ...headingStyle, marginBottom: '1rem' }}>
            <span style={{ color: COLORS.primary }}>Surecast</span>
          </h1>
          <p style={{
            fontSize: '1.6rem',
            color: COLORS.grayMid,
            marginTop: 0,
            marginBottom: '2rem',
            maxWidth: '480px',
            lineHeight: 1.5,
          }}>
            Compose, execute, and share DeFi workflows across 5 chains
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            marginBottom: '2.5rem',
          }}>
            {['Swap', 'Bridge', 'Deposit', 'Stake', 'ENS Sharing'].map((label) => (
              <span key={label} style={{
                padding: '0.4rem 1rem',
                borderRadius: '999px',
                backgroundColor: COLORS.infoBg,
                color: COLORS.accent,
                fontSize: '0.9rem',
                fontWeight: 600,
              }}>
                {label}
              </span>
            ))}
          </div>
          {!isMetaMaskReady ? (
            <div style={{
              ...sectionCardStyle,
              marginTop: 0,
              padding: '2.5rem 2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <h3 style={{ ...sectionTitleStyle, fontSize: '1.2rem' }}>Get Started</h3>
              <p style={{ ...txDescriptionStyle, marginBottom: '1rem' }}>
                Snaps is pre-release software only available in MetaMask Flask.
              </p>
              <InstallFlaskButton />
            </div>
          ) : (
            <div style={{
              ...sectionCardStyle,
              marginTop: 0,
              padding: '2.5rem 2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <h3 style={{ ...sectionTitleStyle, fontSize: '1.2rem' }}>Get Started</h3>
              <p style={{ ...txDescriptionStyle, marginBottom: '1rem' }}>
                Connect to install the Surecast snap and start composing workflows.
              </p>
              <ConnectButton
                onClick={requestSnap}
                disabled={!isMetaMaskReady}
              />
            </div>
          )}
        </div>
      )}

      {/* ===== CONNECTED STATE: Dashboard ===== */}
      {isConnected && (
        <>
          <h1 style={{ ...headingStyle, fontSize: '2.4rem', marginBottom: '0.5rem' }}>
            <span style={{ color: COLORS.primary }}>Surecast</span> Dashboard
          </h1>
          <p style={subtitleStyle}>DeFi workflow composer for MetaMask</p>

          {shouldDisplayReconnectButton(installedSnap) && (
            <div style={{ marginTop: '1rem' }}>
              <ReconnectButton onClick={requestSnap} disabled={!installedSnap} />
            </div>
          )}

          {/* Workflow Card */}
          {workflowInfo && (
            <div style={{
              ...sectionCardStyle,
              backgroundColor: COLORS.infoBg,
              borderColor: COLORS.primary,
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
        </>
      )}

      {/* Executor Section */}
      {isConnected && (
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
                <StepProgressBar execution={execution} workflow={workflow} quoteInfos={quoteInfos} />
              )}
            </>
          )}

          {execStatus === 'paused' && (
            <>
              <p style={statusMessageStyle}>{execMessage}</p>
              {execution && workflow && (
                <StepProgressBar execution={execution} workflow={workflow} quoteInfos={quoteInfos} />
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
                <StepProgressBar execution={execution} workflow={workflow} quoteInfos={quoteInfos} />
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
      {isConnected && (
        <div style={{
          ...sectionCardStyle,
          marginTop: '1.5rem',
          ...(ensTxHash
            ? { borderColor: COLORS.success }
            : ensStatus.includes('failed')
              ? { borderColor: COLORS.error }
              : {}),
        }}>
          <h3 style={sectionTitleStyle}>ENS Workflow Sharing</h3>

          {pendingEnsTx && (
            <div style={{
              backgroundColor: COLORS.warningBg,
              border: `1px solid ${COLORS.primary}`,
              borderRadius: '8px',
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
            <div style={{ marginBottom: '0.5rem' }}>
              <p style={txDescriptionStyle}>
                No ENS name detected automatically.{' '}
                <a
                  href="https://app.ens.domains"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: COLORS.primary, fontWeight: 500 }}
                >
                  Get one at app.ens.domains
                </a>
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="yourname.eth"
                  value={manualEnsInput}
                  onChange={(e) => setManualEnsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualEnsInput) {
                      setEnsManually(manualEnsInput);
                    }
                  }}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: `1px solid ${COLORS.grayLight}`,
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    width: '200px',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  style={{
                    ...primaryButtonStyle,
                    marginTop: 0,
                    opacity: manualEnsInput ? 1 : 0.5,
                  }}
                  onClick={() => setEnsManually(manualEnsInput)}
                  disabled={!manualEnsInput}
                >
                  Set ENS
                </button>
              </div>
            </div>
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

          {ensName && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <p style={{ ...txDescriptionStyle, margin: 0, fontWeight: 600 }}>
                  Your ENS Workflows
                </p>
                <button
                  style={{ ...retryButtonStyle, fontSize: '0.75rem', padding: '0.2rem 0.5rem', minHeight: 'auto', marginTop: 0, lineHeight: 1.2 }}
                  onClick={refreshEnsManifest}
                >
                  Refresh from ENS
                </button>
              </div>
              {myEnsWorkflows.length === 0 ? (
                <p style={{ ...txDescriptionStyle, fontSize: '0.85rem', color: COLORS.grayMid }}>
                  No workflows saved to ENS yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
                  {myEnsWorkflows.map((entry) => (
                    <div
                      key={entry.slug}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.4rem 0.75rem',
                        border: `1px solid ${COLORS.grayLight}`,
                        borderRadius: '8px',
                        width: '100%',
                        maxWidth: '400px',
                      }}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{entry.name}</span>
                        <br />
                        <span style={{ fontSize: '0.75rem', color: COLORS.grayMid }}>
                          {getWorkflowKey(entry.slug)}
                        </span>
                      </div>
                      <button
                        style={{ ...primaryButtonStyle, fontSize: '0.8rem', padding: '0.3rem 0.6rem', marginTop: 0 }}
                        onClick={() => loadMyEnsWorkflow(entry.slug)}
                      >
                        Load
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <p style={txDescriptionStyle}>Load from another ENS name:</p>
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
                    borderRadius: '8px',
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
                    borderRadius: '8px',
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
