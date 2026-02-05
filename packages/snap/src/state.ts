import type { Json } from '@metamask/snaps-sdk';

import type { SnapState } from './types';

const DEFAULT_STATE: SnapState = {
  workflows: [],
  currentWorkflow: null,
  preparedTx: null,
  quote: null,
  userAddress: null,
  userEns: null,
  preferences: {
    slippage: 0.5,
    defaultChain: 1,
  },
};

export async function getState(): Promise<SnapState> {
  const stored = await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get' },
  });
  if (!stored) {
    return DEFAULT_STATE;
  }
  return { ...DEFAULT_STATE, ...(stored as Partial<SnapState>) };
}

export async function setState(
  partial: Partial<SnapState>,
): Promise<SnapState> {
  const current = await getState();
  const next = { ...current, ...partial };
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', newState: next as Record<string, Json> },
  });
  return next;
}

export async function clearState(): Promise<void> {
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', newState: DEFAULT_STATE as Record<string, Json> },
  });
}
