import type { Workflow } from '../types';
import { generateId } from '../helpers';

// ENS Public Resolver on mainnet
export const ENS_PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63';
export const ENS_WORKFLOW_KEY = 'com.surecast.workflow';

// ============================================================
// ABI ENCODING HELPERS
// ============================================================

function toHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

function padRight(hex: string, bytes: number): string {
  return hex.padEnd(bytes * 2, '0');
}

function encodeUint256(num: number): string {
  return num.toString(16).padStart(64, '0');
}

/**
 * ABI-encode a setText(bytes32 node, string key, string value) call.
 * Function selector: 0x10f13a8c
 */
export function encodeSetText(node: string, key: string, value: string): string {
  const selector = '10f13a8c';
  const nodeHex = node.startsWith('0x') ? node.slice(2) : node;

  const keyHex = toHex(key);
  const keyLength = key.length;
  const keyPadded = padRight(keyHex, Math.ceil(keyLength / 32) * 32 || 32);

  const valueHex = toHex(value);
  const valueLength = value.length;
  const valuePadded = padRight(valueHex, Math.ceil(valueLength / 32) * 32 || 32);

  // Offset to key: 96 bytes (3 * 32) from start of params
  const keyOffset = encodeUint256(96);

  // Offset to value: 96 + 32 (key length word) + key data length
  const keyDataSize = 32 + (Math.ceil(keyLength / 32) * 32 || 32);
  const valueOffset = encodeUint256(96 + keyDataSize);

  const encodedKey = encodeUint256(keyLength) + keyPadded;
  const encodedValue = encodeUint256(valueLength) + valuePadded;

  return '0x' + selector + nodeHex + keyOffset + valueOffset + encodedKey + encodedValue;
}

// ============================================================
// WORKFLOW SERIALIZATION
// ============================================================

type CompactStep = {
  t: string;
  ft?: string;
  tt?: string;
  fc?: number;
  tc?: number;
  a?: string;
  all?: boolean;
};

type CompactWorkflow = {
  v: 1;
  name: string;
  ts: number;
  steps: CompactStep[];
};

export function serializeWorkflow(workflow: Workflow): string {
  const compact: CompactWorkflow = {
    v: 1,
    name: workflow.name,
    ts: workflow.updatedAt,
    steps: workflow.steps.map((s) => {
      const step: CompactStep = { t: s.type };
      if (s.config.fromToken) step.ft = s.config.fromToken;
      if (s.config.toToken) step.tt = s.config.toToken;
      if (s.config.fromChain) step.fc = s.config.fromChain;
      if (s.config.toChain) step.tc = s.config.toChain;
      if (s.config.amount) step.a = s.config.amount;
      if (s.config.useAllFromPrevious) step.all = true;
      return step;
    }),
  };
  return JSON.stringify(compact);
}

export function deserializeWorkflow(json: string): Workflow {
  const compact = JSON.parse(json) as CompactWorkflow;

  return {
    id: generateId(),
    name: compact.name,
    steps: compact.steps.map((s) => ({
      id: generateId(),
      type: s.t as Workflow['steps'][0]['type'],
      config: {
        ...(s.ft ? { fromToken: s.ft } : {}),
        ...(s.tt ? { toToken: s.tt } : {}),
        ...(s.fc ? { fromChain: s.fc } : {}),
        ...(s.tc ? { toChain: s.tc } : {}),
        ...(s.a ? { amount: s.a } : {}),
        ...(s.all ? { useAllFromPrevious: true } : {}),
      },
    })),
    createdAt: compact.ts,
    updatedAt: Date.now(),
  };
}
