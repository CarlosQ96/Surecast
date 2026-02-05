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

  it('returns workflows', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'getWorkflows',
    });

    expect(response).toRespondWith([]);
  });

  it('returns current workflow', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'getCurrentWorkflow',
    });

    expect(response).toRespondWith(null);
  });

  it('sets user address', async () => {
    const { request } = await installSnap();

    const setResponse = await request({
      method: 'setUserAddress',
      params: { address: '0x1234567890abcdef1234567890abcdef12345678' },
    });

    expect(setResponse).toRespondWith(null);

    const stateResponse = await request({
      method: 'getState',
    });

    expect(stateResponse).toRespondWith(
      expect.objectContaining({
        userAddress: '0x1234567890abcdef1234567890abcdef12345678',
      }),
    );
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

describe('onHomePage', () => {
  it('renders the home page', async () => {
    const { onHomePage } = await installSnap();

    const response = await onHomePage();

    const screen = response.getInterface();
    expect(screen).toBeDefined();
  });
});
