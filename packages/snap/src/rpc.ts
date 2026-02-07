import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';

import { CHAINS } from './data/chains';
import { TOKENS } from './data/tokens';
import {
  ENS_PUBLIC_RESOLVER,
  encodeSetText,
  serializeWorkflow,
  deserializeWorkflow,
  slugify,
  getWorkflowKey,
} from './services/ens';
import { getSwapQuote } from './services/lifi';
import { getState, setState } from './state';
import { parseAmount, generateId } from './helpers';
import type { WorkflowExecution, StepExecutionStatus } from './types';

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'getState':
      return getState();

    case 'getWorkflows': {
      const s = await getState();
      return s.workflows;
    }

    case 'getCurrentWorkflow': {
      const s = await getState();
      return s.currentWorkflow;
    }

    case 'setUserAddress': {
      const params = request.params as { address: string } | undefined;
      if (!params?.address) {
        throw new Error('Missing address parameter.');
      }
      await setState({ userAddress: params.address });

      let ens: string | null = null;
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
        toTokenInfo?.address ?? toSymbol,
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

    case 'saveWorkflow': {
      const params = request.params as { name: string } | undefined;
      if (!params?.name) throw new Error('Missing name parameter.');

      const s = await getState();
      const wf = s.currentWorkflow;
      if (!wf) throw new Error('No active workflow to save.');

      const saved = { ...wf, name: params.name, updatedAt: Date.now() };
      const workflows = [...s.workflows];
      const existingIdx = workflows.findIndex((w) => w.id === saved.id);
      if (existingIdx >= 0) {
        workflows[existingIdx] = saved;
      } else {
        workflows.push(saved);
      }

      await setState({ currentWorkflow: saved, workflows });
      return { success: true, workflowId: saved.id };
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
      const params = request.params as { namehash: string; slug?: string } | undefined;
      if (!params?.namehash) throw new Error('Missing namehash parameter.');

      const s = await getState();
      const wf = s.currentWorkflow;
      if (!wf || wf.steps.length === 0) {
        throw new Error('No workflow with steps to save.');
      }

      const workflowSlug = params.slug || slugify(wf.name);
      const ensKey = getWorkflowKey(workflowSlug);
      const serialized = serializeWorkflow(wf);
      const callData = encodeSetText(params.namehash, ensKey, serialized);

      await setState({
        preparedTx: {
          to: ENS_PUBLIC_RESOLVER,
          data: callData,
          value: '0x0',
          chainId: 1,
          type: 'ens-write',
          description: `Save workflow "${wf.name}" to ENS (${ensKey})`,
        },
      });

      return { success: true, key: ensKey, slug: workflowSlug };
    }

    case 'importWorkflow': {
      const params = request.params as { workflowJson: string } | undefined;
      if (!params?.workflowJson) throw new Error('Missing workflowJson parameter.');

      const imported = deserializeWorkflow(params.workflowJson);
      await setState({ currentWorkflow: imported });
      return imported;
    }

    case 'deleteWorkflow': {
      const params = request.params as { workflowId: string } | undefined;
      if (!params?.workflowId) throw new Error('Missing workflowId parameter.');

      const s = await getState();
      const filtered = s.workflows.filter((w) => w.id !== params.workflowId);

      // If deleting the active workflow, clear it
      const isCurrent = s.currentWorkflow?.id === params.workflowId;
      await setState({
        workflows: filtered,
        ...(isCurrent ? { currentWorkflow: null } : {}),
      });

      return { success: true, remaining: filtered.length };
    }

    case 'loadWorkflow': {
      const params = request.params as { workflowId: string } | undefined;
      if (!params?.workflowId) throw new Error('Missing workflowId parameter.');

      const s = await getState();
      const target = s.workflows.find((w) => w.id === params.workflowId);
      if (!target) throw new Error('Workflow not found.');

      await setState({ currentWorkflow: target });
      return target;
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

    default:
      throw new Error('Method not found.');
  }
};
