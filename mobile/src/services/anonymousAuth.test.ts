import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  },
}));

import { getAnonymousIdToken } from './anonymousAuth';

describe('anonymous Firebase auth', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'public-test-key');
    vi.restoreAllMocks();
  });

  it('creates one anonymous identity and reuses its ID token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ idToken: 'id-1', refreshToken: 'refresh-1', expiresIn: '3600' }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getAnonymousIdToken()).toBe('id-1');
    expect(await getAnonymousIdToken()).toBe('id-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('accounts:signUp');
  });

  it('refreshes an expired ID token without changing the anonymous account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ idToken: 'id-1', refreshToken: 'refresh-1', expiresIn: '1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-2', refresh_token: 'refresh-2', expires_in: '3600' }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getAnonymousIdToken()).toBe('id-1');
    expect(await getAnonymousIdToken()).toBe('id-2');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('securetoken.googleapis.com');
  });
});
