import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
vi.mock('./appCheck', () => ({ getAppCheckToken: async () => 'test-app-check-token' }));
vi.mock('expo-secure-store', () => {
  const secure = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => secure.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      secure.delete(key);
    },
  };
});
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

import { useAppStore, useStorageStatus } from '../store/useAppStore';
import { ApiError, type SyncHttpResult } from './api';
import { signOutAndClear } from './signOut';
import { PUSH_DEBOUNCE_MS, configureSync, onAccountLinked, resetSyncForTests, startSync } from './sync';
import { isLinkedAccount, setSimulateLinkedAccount } from './syncAccount';
import { MockSyncServer } from './syncMockServer';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');

let server: MockSyncServer;
let offline: boolean;
let calls: string[];

const request = async (method: 'GET' | 'PUT', body?: unknown): Promise<SyncHttpResult> => {
  calls.push(method);
  if (offline) throw new ApiError('network', 'Network request failed.');
  const response = method === 'GET' ? server.get() : server.put(JSON.stringify(body));
  if (response.status === 200) return { kind: 'ok', body: response.body };
  if (response.status === 409) return { kind: 'conflict', body: response.body };
  throw new ApiError('server', 'unexpected');
};

const addTarget = (): string =>
  useAppStore.getState().addTarget({ roleId: 'software-engineer', level: 'internship', experience: 'x' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('__DEV__', true);
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'true');
  resetSyncForTests();
  useAppStore.getState().resetAll();
  useStorageStatus.setState({ ready: true, error: null });
  server = new MockSyncServer(() => NOW);
  offline = false;
  calls = [];
  // The real account check, so signing out really unlinks.
  configureSync({ request, isLinked: isLinkedAccount });
  setSimulateLinkedAccount(true);
});

afterEach(() => {
  resetSyncForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('signOutAndClear', () => {
  it('pushes unsynced work first, then signs out and clears only this device', async () => {
    addTarget();
    expect(useAppStore.getState().sync.dirty).toBe(true);

    await expect(signOutAndClear()).resolves.toBe('cleared');

    expect(isLinkedAccount()).toBe(false);
    expect(useAppStore.getState().targets).toEqual([]);
    expect((server.get().body as { targets: unknown[] }).targets).toHaveLength(1);
  });

  it('is not undone by a later pull, because nothing pulls once signed out', async () => {
    addTarget();
    const stop = startSync();
    await vi.advanceTimersByTimeAsync(0);
    await signOutAndClear();
    calls.length = 0;

    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 20);

    expect(calls).toEqual([]);
    expect(useAppStore.getState().targets).toEqual([]);
    stop();
  });

  it('keeps the cloud copy: signing back in restores it', async () => {
    const targetId = addTarget();
    await signOutAndClear();

    setSimulateLinkedAccount(true);
    onAccountLinked();
    await vi.advanceTimersByTimeAsync(0);

    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([targetId]);
  });

  it('clears nothing when changes cannot reach the account, unless told to', async () => {
    addTarget();
    offline = true;

    await expect(signOutAndClear()).resolves.toBe('unsynced');
    expect(useAppStore.getState().targets).toHaveLength(1);
    expect(isLinkedAccount()).toBe(true);

    await expect(signOutAndClear({ force: true })).resolves.toBe('cleared');
    expect(useAppStore.getState().targets).toEqual([]);
    expect(isLinkedAccount()).toBe(false);
  });

  it('closes an open undo so the delete reaches the account before clearing', async () => {
    const targetId = addTarget();
    const entryId = useAppStore.getState().addCvEntry({ targetId, taskId: 'k', status: 'ready', text: 'Built 1 API.' });
    await signOutAndClear();
    setSimulateLinkedAccount(true);
    onAccountLinked();
    await vi.advanceTimersByTimeAsync(0);
    useAppStore.getState().deleteCvEntry(entryId);

    await expect(signOutAndClear()).resolves.toBe('cleared');

    const stored = server.get().body as { cvEntries: Array<{ id: string; deletedAt?: string }> };
    expect(stored.cvEntries.find((entry) => entry.id === entryId)).toHaveProperty('deletedAt');
  });

  it('falls back to the plain local reset for an account that is not linked', async () => {
    setSimulateLinkedAccount(false);
    addTarget();

    await expect(signOutAndClear()).resolves.toBe('cleared');

    expect(calls).toEqual([]);
    expect(useAppStore.getState().targets).toEqual([]);
  });
});
