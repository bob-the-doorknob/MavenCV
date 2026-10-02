import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
vi.mock('./appCheck', () => ({ getAppCheckToken: async () => 'test-app-check-token' }));

import { ApiError, requestSync } from './api';
import { SYNC_MAX_BODY_BYTES, mockSyncServer } from './syncMockServer';

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'true');
  vi.stubEnv('EXPO_PUBLIC_MOCK_FAIL', '');
  mockSyncServer.reset();
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const snapshot = (base: string | null) => ({ schemaVersion: 1, targets: [], cvEntries: [], baseServerUpdatedAt: base });

describe('requestSync in mock mode', () => {
  it('round-trips through the in-memory server without touching the network', async () => {
    const put = await requestSync('PUT', snapshot(null));
    const get = await requestSync('GET');

    expect(put.kind).toBe('ok');
    expect(get).toEqual(put);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a 409 with its snapshot instead of throwing', async () => {
    await requestSync('PUT', snapshot(null));
    const conflict = await requestSync('PUT', snapshot(null));

    expect(conflict.kind).toBe('conflict');
    expect(conflict.body).toHaveProperty('snapshot');
  });

  it('keeps the backend code on the error, so a wrong clock can be told apart', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000).toISOString();
    const error = await requestSync('PUT', {
      ...snapshot(null),
      targets: [{ id: 'gone', updatedAt: future, deletedAt: future }],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'invalid_response', code: 'SYNC_CLOCK_SKEW' });
  });

  it('refuses an oversized snapshot before sending anything', async () => {
    const error = await requestSync('PUT', { ...snapshot(null), padding: 'x'.repeat(SYNC_MAX_BODY_BYTES) }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ code: 'SYNC_PAYLOAD_TOO_LARGE' });
    expect(mockSyncServer.get().body).toMatchObject({ serverUpdatedAt: null });
  });

  it('does not ask for AI consent — sync never reaches Gemini', async () => {
    // No consent has been loaded or granted in this test file.
    await expect(requestSync('GET')).resolves.toMatchObject({ kind: 'ok' });
  });
});
