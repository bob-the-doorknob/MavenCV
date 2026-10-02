import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => storage.get(`secure:${key}`) ?? null,
  setItemAsync: async (key: string, value: string) => {
    storage.set(`secure:${key}`, value);
  },
  deleteItemAsync: async (key: string) => {
    storage.delete(`secure:${key}`);
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
  },
}));

import { useAppStore } from '../store/useAppStore';
import { getLinkedAccount, getSignedInUid, setLinkedAccount } from './accountState';
import { clearSession, getAnonymousIdToken, replaceSession } from './anonymousAuth';
import { isLinkedAccount } from './syncAccount';

const SESSION_KEY = 'secure:trajectory-firebase-anonymous-auth-v1';

beforeEach(async () => {
  storage.clear();
  vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'public-test-key');
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
  vi.stubGlobal('__DEV__', false);
  useAppStore.getState().resetAll();
  useAppStore.getState().setSyncMeta({ ownerUid: 'linked-uid' });
  await setLinkedAccount({ uid: 'linked-uid', provider: 'google.com', email: 'a@b.c', needsReauth: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('refreshing a linked session', () => {
  it('pauses sync and asks for sign-in when the refresh token is refused, keeping local data', async () => {
    storage.set(SESSION_KEY, 'linked-refresh');
    useAppStore.getState().addTarget({ roleId: 'software-engineer', level: 'internship', experience: 'x' });
    expect(isLinkedAccount()).toBe(true);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'TOKEN_EXPIRED' } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ idToken: 'anon-id', refreshToken: 'anon-refresh', expiresIn: '3600' }) }),
    );

    // The device keeps working on a fresh anonymous session...
    await expect(getAnonymousIdToken()).resolves.toBe('anon-id');

    // ...but the account is marked, sync stops, and Purchases sees no signed-in UID.
    expect(getLinkedAccount()).toMatchObject({ uid: 'linked-uid', needsReauth: true });
    expect(isLinkedAccount()).toBe(false);
    expect(getSignedInUid()).toBeNull();
    expect(useAppStore.getState().targets).toHaveLength(1);
  });

  it('changes nothing about the account on a transient failure', async () => {
    storage.set(SESSION_KEY, 'linked-refresh');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(getAnonymousIdToken()).rejects.toThrow('offline');

    expect(getLinkedAccount()).toMatchObject({ needsReauth: false });
    expect(isLinkedAccount()).toBe(true);
  });
});

describe('a refresh in flight when the session changes', () => {
  const deferredFetch = () => {
    let resolve: (value: unknown) => void = () => {};
    const response = new Promise((r) => {
      resolve = r;
    });
    return { response, resolve };
  };

  it('cannot overwrite a session adopted by linking', async () => {
    await setLinkedAccount(null);
    storage.set(SESSION_KEY, 'old-refresh');
    const slow = deferredFetch();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(slow.response));

    const inFlight = getAnonymousIdToken();
    await Promise.resolve();
    await replaceSession({ idToken: 'linked-id', refreshToken: 'linked-refresh', expiresAt: Date.now() + 3_600_000 });
    slow.resolve({ ok: true, json: async () => ({ id_token: 'old-id-2', refresh_token: 'old-refresh-2', expires_in: '3600' }) });

    await expect(inFlight).resolves.toBe('linked-id');
    expect(storage.get(SESSION_KEY)).toBe('linked-refresh');
    await expect(getAnonymousIdToken()).resolves.toBe('linked-id');
  });

  it('cannot bring back a session cleared by sign-out or deletion', async () => {
    await setLinkedAccount(null);
    storage.set(SESSION_KEY, 'old-refresh');
    const slow = deferredFetch();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(slow.response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ idToken: 'fresh-anon-id', refreshToken: 'fresh-anon-refresh', expiresIn: '3600' }) }),
    );

    const inFlight = getAnonymousIdToken();
    await Promise.resolve();
    await clearSession();
    slow.resolve({ ok: true, json: async () => ({ id_token: 'old-id-2', refresh_token: 'old-refresh-2', expires_in: '3600' }) });

    // The stale refresh is dropped; the request starts over as a new anonymous user.
    await expect(inFlight).resolves.toBe('fresh-anon-id');
    expect(storage.get(SESSION_KEY)).toBe('fresh-anon-refresh');
  });
});
