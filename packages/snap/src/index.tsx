import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'ping':
      return 'pong';

    case 'getState':
      return snap.request({
        method: 'snap_manageState',
        params: { operation: 'get' },
      });

    default:
      throw new Error('Method not found.');
  }
};
