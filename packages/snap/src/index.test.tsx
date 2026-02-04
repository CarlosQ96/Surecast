import { expect } from '@jest/globals';
import { installSnap } from '@metamask/snaps-jest';

describe('onRpcRequest', () => {
  it('responds to ping', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'ping',
    });

    expect(response).toRespondWith('pong');
  });

  it('throws on unknown method', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'foo',
    });

    expect(response).toRespondWithError({
      code: -32603,
      message: 'Method not found.',
      stack: expect.any(String),
    });
  });
});
