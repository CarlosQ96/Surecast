export type StepType =
  | 'swap'
  | 'bridge'
  | 'deposit'
  | 'withdraw'
  | 'stake'
  | 'unstake'
  | 'borrow'
  | 'repay';

export type WorkflowStep = {
  id: string;
  type: StepType;
  config: {
    protocol?: string;
    fromToken?: string;
    toToken?: string;
    amount?: string;
    useAllFromPrevious?: boolean;
    fromChain?: number;
    toChain?: number;
  };
};

export type Workflow = {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  ensName?: string;
  ensKey?: string;
};

export type PreparedTransaction = {
  to: string;
  data: string;
  value: string;
  chainId: number;
  gasLimit?: string;
  type?: string;
  description?: string;
  stepId?: string;
};

export type StepExecutionStatus =
  | 'pending'
  | 'quoting'
  | 'ready'
  | 'switching-chain'
  | 'confirming'
  | 'success'
  | 'error';

export type StepExecution = {
  stepId: string;
  status: StepExecutionStatus;
  txHash: string | null;
  chainId: number | null;
  error: string | null;
  quotedOutput: string | null;
  quotedOutputDecimals: number | null;
};

export type WorkflowExecution = {
  workflowId: string;
  startedAt: number;
  currentStepIndex: number;
  steps: StepExecution[];
  status: 'running' | 'paused' | 'completed' | 'failed';
};

export type SnapState = {
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  preparedTx: PreparedTransaction | null;
  quote: Record<string, string | number | boolean | null> | null;
  userAddress: string | null;
  userEns: string | null;
  preferences: {
    slippage: number;
    defaultChain: number;
  };
  execution: WorkflowExecution | null;
};
