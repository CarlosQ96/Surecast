import type { Json } from '@metamask/snaps-sdk';

import type { SnapState } from './types';

const DEFAULT_STATE: SnapState = {
  currentWorkflow: null,
  savedWorkflows: [],
  preparedTx: null,
  userAddress: null,
  userEns: null,
  userNamehash: null,
  preferences: {
    slippage: 0.5,
    defaultChain: 1,
  },
  execution: null,
};

// In-memory cache — persists while the snap service worker is alive.
// Eliminates snap_manageState reads on every button click.
let cache: SnapState | null = null;

export async function getState(): Promise<SnapState> {
  if (cache) return cache;
  const stored = await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get', encrypted: false },
  });
  cache = stored ? { ...DEFAULT_STATE, ...(stored as Partial<SnapState>) } : DEFAULT_STATE;
  return cache;
}

/**
 * Write state — 1 SES call. Updates both cache and persistence.
 */
export async function writeState(
  current: SnapState,
  partial: Partial<SnapState>,
): Promise<SnapState> {
  const next = { ...current, ...partial };
  cache = next;
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', encrypted: false, newState: next as Record<string, Json> },
  });
  return next;
}

/**
 * setState for callers that don't have the current state (e.g. RPC, onInstall).
 * Costs 2 SES calls on first use, 1 after cache is warm.
 */
export async function setState(
  partial: Partial<SnapState>,
): Promise<SnapState> {
  const current = await getState();
  return writeState(current, partial);
}

/** Invalidate cache and re-read from storage. 1 SES call. */
export async function refreshState(): Promise<SnapState> {
  cache = null;
  return getState();
}

export async function clearState(): Promise<void> {
  cache = DEFAULT_STATE;
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', encrypted: false, newState: DEFAULT_STATE as Record<string, Json> },
  });
}
