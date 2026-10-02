import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
vi.mock('./appCheck', () => ({ getAppCheckToken: async () => 'test-app-check-token' }));
vi.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: async (key: string) => {
        memory.delete(key);
      },
    },
  };
});
// The real transport, replaced by a spy: the point is to prove it is never reached.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, requestSync: vi.fn(actual.requestSync) };
});

import { useAppStore, useStorageStatus } from '../store/useAppStore';
import { requestSync } from './api';
import { PUSH_DEBOUNCE_MS, onAccountLinked, onForeground, resetSyncForTests, startSync, syncNow } from './sync';
import { canSimulateLinkedAccount, isLinkedAccount, setSimulateLinkedAccount, useSyncDevAccount } from './syncAccount';

const mockedRequestSync = vi.mocked(requestSync);

const configure = (dev: boolean, mock: boolean): void => {
  vi.stubGlobal('__DEV__', dev);
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', mock ? 'true' : 'false');
};

beforeEach(() => {
  vi.useFakeTimers();
  resetSyncForTests();
  useSyncDevAccount.setState({ simulateLinked: false });
  useAppStore.getState().resetAll();
  useStorageStatus.setState({ ready: true, error: null });
  mockedRequestSync.mockClear();
});

afterEach(() => {
  resetSyncForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('simulate-linked-account switch', () => {
  it('works in a development build in mock mode', () => {
    configure(true, true);
    expect(canSimulateLinkedAccount()).toBe(true);

    setSimulateLinkedAccount(true);

    expect(isLinkedAccount()).toBe(true);
  });

  it.each([
    ['a production build against the real backend', false, false],
    ['a production build with the mock flag set', false, true],
    ['a development build against the real backend', true, false],
  ])('is inert in %s', (_label, dev, mock) => {
    configure(dev, mock);

    setSimulateLinkedAccount(true);
    expect(useSyncDevAccount.getState().simulateLinked).toBe(false);

    // Even if the flag were flipped behind the setter's back, nothing reads it.
    useSyncDevAccount.setState({ simulateLinked: true });
    expect(canSimulateLinkedAccount()).toBe(false);
    expect(isLinkedAccount()).toBe(false);
  });

  it('never reaches the network under the production config, whatever the switch says', async () => {
    configure(false, false);
    useSyncDevAccount.setState({ simulateLinked: true });
    const stop = startSync();

    useAppStore.getState().addTarget({ roleId: 'software-engineer', level: 'internship', experience: 'x' });
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 5);
    await syncNow({ pull: true });
    onForeground();
    onAccountLinked();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockedRequestSync).not.toHaveBeenCalled();
    stop();
  });
});
