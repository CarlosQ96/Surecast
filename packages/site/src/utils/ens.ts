import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/** Public Ethereum RPC for read-only ENS calls (always mainnet). */
const ETH_RPC = 'https://ethereum-rpc.publicnode.com';

/** ENS Registry contract address (same on all networks). */
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

/** ENS Public Resolver — where Surecast writes setText data. */
const ENS_PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63';

/** Legacy single-workflow key (backward compat for loading old records). */
export const ENS_WORKFLOW_KEY_LEGACY = 'com.surecast.workflow';

/** Manifest key: tracks all saved workflow slugs+names on ENS. */
export const ENS_MANIFEST_KEY = 'com.surecast.workflows';

// ============================================================
// PURE HELPERS
// ============================================================

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function getWorkflowKey(slug: string): string {
  return `com.surecast.workflow.${slug}`;
}

// ============================================================
// HEX / ABI HELPERS
// ============================================================

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function encodeUint256(num: number): string {
  return num.toString(16).padStart(64, '0');
}

function padRight32(hex: string): string {
  return hex.padEnd(Math.ceil(hex.length / 64) * 64 || 64, '0');
}

/** ABI-encode a dynamic string: length word + padded UTF-8 data. */
function encodeStringData(str: string): string {
  const hex = bytesToHex(utf8ToBytes(str));
  const lengthWord = encodeUint256(str.length);
  const paddedData = padRight32(hex);
  return lengthWord + paddedData;
}

/** Decode an ABI-encoded string from an eth_call hex result. */
function decodeString(hex: string): string | null {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length < 128) return null;

  // First 32 bytes = offset to string data
  const offset = parseInt(h.slice(0, 64), 16) * 2;
  // At offset: 32 bytes = string length
  const length = parseInt(h.slice(offset, offset + 64), 16);
  if (length === 0) return null;

  const dataHex = h.slice(offset + 64, offset + 64 + length * 2);
  return new TextDecoder().decode(hexToBytes(dataHex));
}

// ============================================================
// NAMEHASH (keccak256-based ENS name hashing)
// ============================================================

export function computeNamehash(name: string): string {
  let node = new Uint8Array(32); // starts as 0x00...00

  if (!name) return '0x' + bytesToHex(node);

  // Lowercase for basic normalization (sufficient for ASCII ENS names)
  const labels = name.toLowerCase().split('.').reverse();
  for (const label of labels) {
    const labelHash = keccak_256(utf8ToBytes(label));
    node = new Uint8Array(keccak_256(concatBytes(node, labelHash)));
  }

  return '0x' + bytesToHex(node);
}

// ============================================================
// RAW JSON-RPC
// ============================================================

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
    throw new Error('RPC returned HTML instead of JSON — likely rate-limited');
  }
  const json = JSON.parse(text);
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ============================================================
// ENS: READ TEXT RECORD
// ============================================================

/** Build the ABI calldata for text(bytes32 node, string key). */
function buildTextCalldata(nodeHex: string, key: string): string {
  const keyOffset = encodeUint256(64);
  const encodedKey = encodeStringData(key);
  return '0x59d1d43c' + nodeHex + keyOffset + encodedKey;
}

/** Call text() on a resolver and decode the result. */
async function callText(
  resolver: string,
  nodeHex: string,
  key: string,
): Promise<string | null> {
  const result = await ethCall(resolver, buildTextCalldata(nodeHex, key));
  if (!result || result === '0x') return null;
  return decodeString(result);
}

/**
 * Read a text record from any ENS name.
 *
 * 1. Try the name's own resolver (from ENS Registry)
 * 2. Fall back to the Public Resolver (where Surecast writes via setText)
 */
export async function readEnsText(
  name: string,
  key: string,
): Promise<string | null> {
  const node = computeNamehash(name);
  const nodeHex = node.slice(2);

  // Step 1: Get the name's resolver from the ENS Registry
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

    // If the name's resolver is already the Public Resolver, no need to retry
    if (resolverAddress.toLowerCase() === ENS_PUBLIC_RESOLVER.toLowerCase()) {
      return null;
    }
  }

  // Step 2: Fall back to Public Resolver (Surecast saves setText here)
  return callText(ENS_PUBLIC_RESOLVER, nodeHex, key);
}

// ============================================================
// ENS: REVERSE LOOKUP (address → name)
// ============================================================

export async function lookupEnsName(
  address: string,
): Promise<string | null> {
  const addr = address.toLowerCase().replace('0x', '');
  const reverseName = `${addr}.addr.reverse`;
  const node = computeNamehash(reverseName);
  const nodeHex = node.slice(2);

  // Get resolver
  const resolverCalldata = '0x0178b8bf' + nodeHex;
  const resolverResult = await ethCall(ENS_REGISTRY, resolverCalldata);

  if (
    !resolverResult ||
    resolverResult === '0x' ||
    resolverResult === '0x' + '0'.repeat(64)
  ) {
    return null;
  }

  const resolverAddress = '0x' + resolverResult.slice(26);

  // Call name(bytes32 node) — selector 0x691f3431
  const nameCalldata = '0x691f3431' + nodeHex;
  const nameResult = await ethCall(resolverAddress, nameCalldata);

  return decodeString(nameResult);
}
