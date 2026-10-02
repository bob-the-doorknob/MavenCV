import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = vi.hoisted(() => ({ map: new Map<string, string>(), failReads: false }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    if (secure.failReads) throw new Error('Keychain unavailable');
    return secure.map.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    secure.map.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secure.map.delete(key);
  },
}));

import { getSignedInUid, loadAccountState, setLinkedAccount, useAccountState } from './accountState';

beforeEach(() => {
  secure.map.clear();
  secure.failReads = false;
  useAccountState.setState({ account: null, loaded: false, readFailed: false });
});

describe('loading the saved account', () => {
  it('records a read failure instead of looking signed out, and stays off for sync', async () => {
    await setLinkedAccount({ uid: 'u1', provider: 'google.com', needsReauth: false });
    useAccountState.setState({ account: null, loaded: false });
    secure.failReads = true;

    await loadAccountState();

    expect(useAccountState.getState()).toMatchObject({ account: null, loaded: true, readFailed: true });
    expect(getSignedInUid()).toBeNull();
  });

  it('clears the failure once a retry succeeds', async () => {
    await setLinkedAccount({ uid: 'u1', provider: 'google.com', needsReauth: false });
    secure.failReads = true;
    await loadAccountState();

    secure.failReads = false;
    await loadAccountState();

    expect(useAccountState.getState()).toMatchObject({ readFailed: false, account: { uid: 'u1' } });
  });
});
