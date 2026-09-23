import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => storage.get(`secure:${key}`) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(`secure:${key}`, value); },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
    removeItem: async (key: string) => { storage.delete(key); },
  },
}));

import { getAnonymousIdToken } from './anonymousAuth';

describe('anonymous Firebase auth', () => {
  it('migrates legacy credentials only after verifying the secure copy', async () => {
    const key = 'trajectory-firebase-anonymous-auth-v1';
    storage.set(key, JSON.stringify({ idToken: 'legacy-id', refreshToken: 'legacy-refresh', expiresAt: Date.now() + 3600000 }));
    expect(await getAnonymousIdToken()).toBe('legacy-id');
    expect(storage.get(`secure:${key}`)).toBe('legacy-refresh');
    expect(storage.has(key)).toBe(false);
  });
  it('recovers a definitively revoked refresh token without deleting roadmap data', async () => {
    storage.set('secure:trajectory-firebase-anonymous-auth-v1', 'revoked-refresh');
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'INVALID_REFRESH_TOKEN' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ idToken: 'new-id', refreshToken: 'new-refresh', expiresIn: '3600' }) });
    vi.stubGlobal('fetch', request);
    expect(await getAnonymousIdToken()).toBe('new-id');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not create another identity after transient refresh failure', async () => {
    storage.set('secure:trajectory-firebase-anonymous-auth-v1', 'offline-refresh');
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', request);
    await expect(getAnonymousIdToken()).rejects.toThrow('offline');
    expect(request).toHaveBeenCalledTimes(1);
  });
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
