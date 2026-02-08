import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';

import { CHAINS } from './data/chains';
import { TOKENS } from './data/tokens';
import { getVaultTokensForChain } from './data/vaults';
import {
  ENS_PUBLIC_RESOLVER,
  ENS_WORKFLOW_KEY_LEGACY,
  ENS_MANIFEST_KEY,
  encodeSetText,
  encodeMulticall,
  serializeWorkflow,
  deserializeWorkflow,
  serializeManifest,
  deserializeManifest,
  readEnsText,
  slugify,
  getWorkflowKey,
} from './services/ens';
import type { ManifestEntry } from './services/ens';
import { getSwapQuote } from './services/lifi';
import { getState, setState } from './state';
import { parseAmount, generateId } from './helpers';
import type { WorkflowExecution, StepExecutionStatus } from './types';

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'getState':
      return getState();

    case 'getCurrentWorkflow': {
      const s = await getState();
      return s.currentWorkflow;
    }

    case 'setUserAddress': {
      const params = request.params as {
        address: string;
        namehash?: string;
        ens?: string;
      } | undefined;
      if (!params?.address) {
        throw new Error('Missing address parameter.');
      }
      await setState({
        userAddress: params.address,
        ...(params.namehash ? { userNamehash: params.namehash } : {}),
        ...(params.ens ? { userEns: params.ens } : {}),
      });

      // If site already provided ENS name, use it directly
      let ens: string | null = params.ens ?? null;

      // Fallback: try ensideas.com only if site didn't provide ENS
      if (!ens) {
        try {
          const res = await fetch(
            `https://api.ensideas.com/ens/resolve/${params.address}`,
          );
          if (res.ok) {
            const data = (await res.json()) as { name?: string };
            if (data.name) {
              ens = data.name;
              await setState({ userEns: ens });
            }
          }
        } catch {
          // ENS lookup is best-effort
        }
      }

      return { success: true, ens };
    }

    case 'getPreparedTransaction': {
      const s = await getState();
      return s.preparedTx;
    }

    case 'clearPreparedTransaction': {
      await setState({ preparedTx: null });
      return { success: true };
    }

    case 'startExecution': {
      const s = await getState();
      const wf = s.currentWorkflow;
      if (!wf || wf.steps.length === 0) {
        throw new Error('No workflow with steps to execute.');
      }

      const execution: WorkflowExecution = {
        workflowId: wf.id,
        startedAt: Date.now(),
        currentStepIndex: 0,
        steps: wf.steps.map((step) => ({
          stepId: step.id,
          status: 'pending' as const,
          txHash: null,
          chainId: null,
          error: null,
          quotedOutput: null,
          quotedOutputDecimals: null,
        })),
        status: 'running',
      };

      await setState({ execution });
      return { execution };
    }

    case 'getExecution': {
      const s = await getState();
      return s.execution;
    }

    case 'prepareStepQuote': {
      const params = request.params as { stepIndex: number } | undefined;
      if (params?.stepIndex === undefined) {
        throw new Error('Missing stepIndex parameter.');
      }

      const s = await getState();
      const wf = s.currentWorkflow;
      if (!wf) throw new Error('No active workflow.');

      const step = wf.steps[params.stepIndex];
      if (!step) throw new Error(`Step ${params.stepIndex} not found.`);

      const cfg = step.config;
      const fromChain = cfg.fromChain ?? CHAINS.ARBITRUM;
      const toChain = cfg.toChain ?? fromChain;
      const fromSymbol = cfg.fromToken ?? 'ETH';
      const toSymbol = cfg.toToken ?? 'USDC';

      const fromTokenInfo = TOKENS[fromChain]?.[fromSymbol];
      const toTokenInfo = TOKENS[toChain]?.[toSymbol];
      if (!fromTokenInfo) {
        throw new Error(`Token ${fromSymbol} not found on chain ${fromChain}.`);
      }

      // Resolve toToken address: vault registry for deposit/stake, TOKENS for swap/bridge
      let toTokenAddress: string;
      if (step.type === 'deposit' || step.type === 'stake') {
        const vaultTokens = getVaultTokensForChain(toChain);
        const vaultToken = vaultTokens.find(
          (vault) => vault.symbol === toSymbol,
        );
        if (!vaultToken) {
          throw new Error(`Vault token ${toSymbol} not found on chain ${toChain}.`);
        }
        toTokenAddress = vaultToken.address;
      } else {
        toTokenAddress = toTokenInfo?.address ?? toSymbol;
      }

      // Resolve amount: use chained output or fixed amount
      let rawAmount: string;
      if (cfg.useAllFromPrevious && params.stepIndex > 0) {
        const prevStep = s.execution?.steps[params.stepIndex - 1];
        if (!prevStep?.quotedOutput) {
          throw new Error('Previous step has no quoted output for chaining.');
        }
        rawAmount = prevStep.quotedOutput;
      } else {
        const humanAmount = cfg.amount ?? '0';
        rawAmount = parseAmount(humanAmount, fromTokenInfo.decimals);
      }

      const userAddr = s.userAddress ?? '0x0000000000000000000000000000000000000000';
      const quote = await getSwapQuote(
        fromChain,
        toChain,
        fromTokenInfo.address,
        toTokenAddress,
        rawAmount,
        userAddr,
        s.preferences.slippage / 100,
      );

      // Store prepared tx with step reference
      const txWithStep = { ...quote.tx, stepId: step.id };
      await setState({ preparedTx: txWithStep });

      // Update execution state with quoted output for chaining
      if (s.execution) {
        const updatedSteps = [...s.execution.steps];
        const execStep = updatedSteps[params.stepIndex];
        if (execStep) {
          updatedSteps[params.stepIndex] = {
            ...execStep,
            status: 'ready',
            quotedOutput: quote.toAmount,
            quotedOutputDecimals: quote.toDecimals,
          };
        }
        await setState({
          execution: { ...s.execution, steps: updatedSteps },
        });
      }

      return quote;
    }

    case 'updateStepStatus': {
      const params = request.params as {
        stepIndex: number;
        status: StepExecutionStatus;
        txHash?: string;
        error?: string;
      } | undefined;

      if (params?.stepIndex === undefined || !params.status) {
        throw new Error('Missing stepIndex or status parameter.');
      }

      const s = await getState();
      if (!s.execution) throw new Error('No active execution.');

      const updatedSteps = [...s.execution.steps];
      const execStep = updatedSteps[params.stepIndex];
      if (!execStep) throw new Error(`Execution step ${params.stepIndex} not found.`);

      updatedSteps[params.stepIndex] = {
        ...execStep,
        status: params.status,
        ...(params.txHash ? { txHash: params.txHash } : {}),
        ...(params.error ? { error: params.error } : {}),
      };

      // Determine overall execution status
      const allSuccess = updatedSteps.every((st) => st.status === 'success');
      const anyError = updatedSteps.some((st) => st.status === 'error');

      const newCurrentIndex = params.status === 'success'
        ? params.stepIndex + 1
        : s.execution.currentStepIndex;

      await setState({
        execution: {
          ...s.execution,
          steps: updatedSteps,
          currentStepIndex: newCurrentIndex,
          status: allSuccess ? 'completed' : anyError ? 'failed' : 'running',
        },
      });

      return { success: true };
    }

    case 'deleteStep': {
      const params = request.params as { stepId: string } | undefined;
      if (!params?.stepId) throw new Error('Missing stepId parameter.');

      const s = await getState();
      const wf = s.currentWorkflow;
      if (!wf) throw new Error('No active workflow.');

      const filtered = wf.steps.filter((step) => step.id !== params.stepId);
      const updated = { ...wf, steps: filtered, updatedAt: Date.now() };
      await setState({ currentWorkflow: updated });
      return { success: true };
    }

    case 'prepareEnsSave': {
      const params = request.params as {
        namehash: string;
        slug?: string;
        manifest?: string;
      } | undefined;
      if (!params?.namehash) throw new Error('Missing namehash parameter.');

      const s = await getState();
      const wf = s.currentWorkflow;
      if (!wf || wf.steps.length === 0) {
        throw new Error('No workflow with steps to save.');
      }

      const workflowSlug = params.slug || slugify(wf.name);
      const ensKey = getWorkflowKey(workflowSlug);
      const serialized = serializeWorkflow(wf);

      // Build setText for the workflow data
      const workflowCall = encodeSetText(params.namehash, ensKey, serialized);

      // Build updated manifest: merge existing + new entry
      let manifestEntries: ManifestEntry[] = [];
      if (params.manifest) {
        try {
          manifestEntries = deserializeManifest(params.manifest);
        } catch {
          // start fresh if manifest is corrupted
        }
      }
      // Add or update entry for this workflow
      const existing = manifestEntries.findIndex((entry) => entry.slug === workflowSlug);
      if (existing >= 0) {
        manifestEntries[existing] = { slug: workflowSlug, name: wf.name };
      } else {
        manifestEntries.push({ slug: workflowSlug, name: wf.name });
      }
      const manifestCall = encodeSetText(
        params.namehash,
        ENS_MANIFEST_KEY,
        serializeManifest(manifestEntries),
      );

      // Multicall: batch both setText calls into one transaction
      const multicallData = encodeMulticall([workflowCall, manifestCall]);

      await setState({
        preparedTx: {
          to: ENS_PUBLIC_RESOLVER,
          data: multicallData,
          value: '0x0',
          chainId: 1,
          type: 'ens-write',
          description: `Save "${wf.name}" to ENS (${ensKey})`,
        },
      });

      return { success: true, key: ensKey, slug: workflowSlug };
    }

    case 'loadFromEns': {
      const params = request.params as { namehash: string; slug?: string } | undefined;
      if (!params?.namehash) throw new Error('Missing namehash parameter.');

      const ensKey = params.slug
        ? getWorkflowKey(params.slug)
        : ENS_WORKFLOW_KEY_LEGACY;

      // Try slug-based key first
      let workflowJson = await readEnsText(params.namehash, ensKey);

      // Fallback to legacy key if slug was provided but not found
      if (!workflowJson && params.slug) {
        workflowJson = await readEnsText(params.namehash, ENS_WORKFLOW_KEY_LEGACY);
      }

      if (!workflowJson) {
        throw new Error(`No workflow found (key: ${ensKey}).`);
      }

      const imported = deserializeWorkflow(workflowJson);
      await setState({ currentWorkflow: imported });
      return imported;
    }

    case 'importWorkflow': {
      const params = request.params as { workflowJson: string } | undefined;
      if (!params?.workflowJson) throw new Error('Missing workflowJson parameter.');

      const imported = deserializeWorkflow(params.workflowJson);
      await setState({ currentWorkflow: imported });
      return imported;
    }

    case 'newWorkflow': {
      const newWf = {
        id: generateId(),
        name: 'Untitled Workflow',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await setState({ currentWorkflow: newWf });
      return newWf;
    }

    case 'getSavedWorkflows': {
      const s = await getState();
      return s.savedWorkflows ?? [];
    }

    case 'deleteSavedWorkflow': {
      const params = request.params as { workflowId: string } | undefined;
      if (!params?.workflowId) throw new Error('Missing workflowId parameter.');

      const s = await getState();
      const filtered = (s.savedWorkflows ?? []).filter(
        (item) => item.id !== params.workflowId,
      );
      await setState({ savedWorkflows: filtered });
      return { success: true };
    }

    default:
      throw new Error('Method not found.');
  }
};
