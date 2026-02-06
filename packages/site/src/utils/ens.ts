import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const ENS_PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63';
export const ENS_WORKFLOW_KEY = 'com.surecast.workflow';

/**
 * Compute the ENS namehash for a given name.
 * namehash('') = 0x00...00
 * namehash('eth') = keccak256(namehash('') + keccak256('eth'))
 * namehash('nick.eth') = keccak256(namehash('eth') + keccak256('nick'))
 */
export function namehash(name: string): string {
  let node = new Uint8Array(32);
  if (name === '') return '0x' + bytesToHex(node);

  const labels = name.split('.').reverse();
  for (const label of labels) {
    const labelHash = keccak_256(utf8ToBytes(label));
    const combined = new Uint8Array(64);
    combined.set(node, 0);
    combined.set(labelHash, 32);
    node = new Uint8Array(keccak_256(combined));
  }
  return '0x' + bytesToHex(node);
}

// ============================================================
// ABI ENCODING / DECODING FOR text(bytes32,string)
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
 * ABI-encode a text(bytes32 node, string key) view call.
 * Function selector: 0x59d1d43c
 */
export function encodeGetText(node: string, key: string): string {
  const selector = '59d1d43c';
  const nodeHex = node.startsWith('0x') ? node.slice(2) : node;

  // Offset to key string data: 64 bytes (2 * 32) from start of params
  const keyOffset = encodeUint256(64);

  const keyHex = toHex(key);
  const keyLength = key.length;
  const keyPadded = padRight(keyHex, Math.ceil(keyLength / 32) * 32 || 32);

  const encodedKey = encodeUint256(keyLength) + keyPadded;

  return '0x' + selector + nodeHex + keyOffset + encodedKey;
}

/**
 * Decode an ABI-encoded string response from eth_call.
 * Format: offset (32 bytes) + length (32 bytes) + data (padded to 32 bytes)
 */
export function decodeTextResult(hexData: string): string {
  const data = hexData.startsWith('0x') ? hexData.slice(2) : hexData;

  // Empty response
  if (data.length < 128) return '';

  // Read offset (first 32 bytes) — points to start of string data
  const offset = parseInt(data.slice(0, 64), 16) * 2;

  // Read string length (32 bytes at offset)
  const length = parseInt(data.slice(offset, offset + 64), 16);

  if (length === 0) return '';

  // Read string bytes
  const stringHex = data.slice(offset + 64, offset + 64 + length * 2);

  // Convert hex to UTF-8 string
  let result = '';
  for (let i = 0; i < stringHex.length; i += 2) {
    result += String.fromCharCode(parseInt(stringHex.slice(i, i + 2), 16));
  }
  return result;
}
