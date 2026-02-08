import type { Workflow } from '../types';
import { generateId } from '../helpers';

// ENS Public Resolver on mainnet
export const ENS_PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63';

// Legacy single-workflow key (backward compat for reading)
export const ENS_WORKFLOW_KEY_LEGACY = 'com.surecast.workflow';

/**
 * Convert a workflow name to a URL-safe slug for ENS keys.
 * Lowercase, hyphens for spaces/special chars, max 32 chars.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Build an ENS text record key for a specific workflow.
 * e.g. slugify("Yield Optimizer") => "com.surecast.workflow.yield-optimizer"
 */
export function getWorkflowKey(slug: string): string {
  return `com.surecast.workflow.${slug}`;
}

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
// ENS: READ TEXT RECORD (raw fetch — no keccak needed)
// ============================================================

const ETH_RPC = 'https://ethereum-rpc.publicnode.com';
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

/** ABI-encode a dynamic string: length word + padded UTF-8 data. */
function encodeStringParam(str: string): string {
  const hex = toHex(str);
  const lengthWord = encodeUint256(str.length);
  const paddedData = padRight(hex, Math.ceil(str.length / 32) * 32 || 32);
  return lengthWord + paddedData;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Decode an ABI-encoded string from an eth_call hex result. */
function decodeString(hex: string): string | null {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length < 128) return null;

  const offset = parseInt(h.slice(0, 64), 16) * 2;
  const length = parseInt(h.slice(offset, offset + 64), 16);
  if (length === 0) return null;

  const dataHex = h.slice(offset + 64, offset + 64 + length * 2);
  const bytes = hexToBytes(dataHex);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i] as number);
  }
  return result;
}

async function ethCall(to: string, data: string): Promise<string> {
  const response = await fetch(ETH_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  const text = await response.text();
  if (text.startsWith('<')) {
    throw new Error('RPC returned HTML — likely rate-limited');
  }
  const json = JSON.parse(text);
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/** Build calldata for text(bytes32 node, string key). Selector: 0x59d1d43c */
function buildTextCalldata(nodeHex: string, key: string): string {
  const keyOffset = encodeUint256(64);
  const encodedKey = encodeStringParam(key);
  return '0x59d1d43c' + nodeHex + keyOffset + encodedKey;
}

async function callText(resolver: string, nodeHex: string, key: string): Promise<string | null> {
  const result = await ethCall(resolver, buildTextCalldata(nodeHex, key));
  if (!result || result === '0x') return null;
  return decodeString(result);
}

/**
 * Read a text record from ENS using a pre-computed namehash.
 * Tries the name's own resolver first, falls back to Public Resolver.
 */
export async function readEnsText(namehash: string, key: string): Promise<string | null> {
  const nodeHex = namehash.startsWith('0x') ? namehash.slice(2) : namehash;

  // Get the name's resolver from ENS Registry
  const resolverCalldata = '0x0178b8bf' + nodeHex;
  const resolverResult = await ethCall(ENS_REGISTRY, resolverCalldata);

  const hasResolver =
    resolverResult &&
    resolverResult !== '0x' &&
    resolverResult !== '0x' + '0'.repeat(64);

  if (hasResolver) {
    const resolverAddress = '0x' + resolverResult.slice(26);
    const value = await callText(resolverAddress, nodeHex, key);
    if (value) return value;

    // If already Public Resolver, no need to retry
    if (resolverAddress.toLowerCase() === ENS_PUBLIC_RESOLVER.toLowerCase()) {
      return null;
    }
  }

  // Fall back to Public Resolver
  return callText(ENS_PUBLIC_RESOLVER, nodeHex, key);
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
