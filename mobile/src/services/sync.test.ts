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

import type { Target } from '../types';
import { useAppStore, useStorageStatus } from '../store/useAppStore';
import { ApiError, type SyncHttpResult } from './api';
import { BACKOFF_MS, PUSH_DEBOUNCE_MS, UNDO_SAFETY_MS, configureSync, resetSyncForTests, startSync, syncNow, onForeground, useSyncStatus } from './sync';
import { MockSyncServer } from './syncMockServer';
import { resetThisDevice } from './localData';

const REAL_NOW = Date.parse('2026-10-02T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1_000;

const KIND_BY_CODE: Record<string, ApiError['kind']> = {
  SYNC_CLOCK_SKEW: 'invalid_response',
  INVALID_SYNC_INPUT: 'invalid_response',
  SYNC_PAYLOAD_TOO_LARGE: 'invalid_response',
  SYNC_SCHEMA_UNSUPPORTED: 'invalid_response',
};

/** api.requestSync's behaviour over a MockSyncServer, with every call recorded. */
const transport = (server: MockSyncServer) => {
  const calls: Array<{ method: 'GET' | 'PUT'; body: unknown }> = [];
  const request = async (method: 'GET' | 'PUT', body?: unknown): Promise<SyncHttpResult> => {
    calls.push({ method, body });
    const response = method === 'GET' ? server.get() : server.put(JSON.stringify(body));
    if (response.status === 200) return { kind: 'ok', body: response.body };
    if (response.status === 409) return { kind: 'conflict', body: response.body };
    const error = (response.body as { error: { code: string; message: string } }).error;
    throw new ApiError(KIND_BY_CODE[error.code] ?? 'server', error.message, error.code);
  };
  return { calls, request };
};

const addTarget = (overrides: Partial<Target> = {}): string =>
  useAppStore.getState().addTarget({
    roleId: 'software-engineer',
    level: 'internship',
    experience: 'Two class projects.',
    roadmap: [
      { id: 'task-1', title: 'Build 1 API', doneWhen: 'Deployed', steps: [], estimatedWeeks: 2, priority: 2, status: 'not_started' },
    ],
    ...overrides,
  });

/** Lets queued promises and any timers due within `ms` run. */
const flush = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

let server: MockSyncServer;
let linked: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(REAL_NOW);
  resetSyncForTests();
  useAppStore.getState().resetAll();
  useStorageStatus.setState({ ready: true, error: null });
  server = new MockSyncServer(() => REAL_NOW);
  linked = true;
});

afterEach(() => {
  resetSyncForTests();
  vi.useRealTimers();
});

const useServer = () => {
  const t = transport(server);
  configureSync({ request: t.request, isLinked: () => linked, now: () => Date.now() });
  return t;
};

describe('account gate', () => {
  it('makes no request at all when the account is not linked', async () => {
    linked = false;
    const { calls } = useServer();
    const stop = startSync();

    addTarget();
    useAppStore.getState().startTask('task-1');
    await flush(10 * PUSH_DEBOUNCE_MS);
    await syncNow({ pull: true });
    onForeground();
    await flush(BACKOFF_MS[4]);

    expect(calls).toEqual([]);
    expect(useSyncStatus.getState().status).toBe('idle');
    stop();
  });
});

describe('push', () => {
  it('debounces a burst of edits into one push about 3 s after the last', async () => {
    const { calls } = useServer();
    const stop = startSync();
    await flush();
    calls.length = 0;

    addTarget();
    await flush(PUSH_DEBOUNCE_MS - 1_000);
    useAppStore.getState().startTask('task-1');
    await flush(PUSH_DEBOUNCE_MS - 1);
    expect(calls).toEqual([]);

    await flush(1);
    await flush();
    expect(calls.map((call) => call.method)).toEqual(['PUT']);
    stop();
  });

  it('clears the dirty flag and records the server version once stored', async () => {
    useServer();
    addTarget();
    expect(useAppStore.getState().sync.dirty).toBe(true);

    await syncNow({ pull: false });

    const { sync } = useAppStore.getState();
    expect(sync.dirty).toBe(false);
    expect(sync.baseServerUpdatedAt).toBe(server.get().body && (server.get().body as { serverUpdatedAt: string }).serverUpdatedAt);
    expect(sync.lastSyncedAt).toBe(new Date(REAL_NOW).toISOString());
    expect(useSyncStatus.getState()).toEqual({ status: 'idle', lastSyncedAt: new Date(REAL_NOW).toISOString() });
  });

  it('never sends a pending CV bullet', async () => {
    const { calls } = useServer();
    addTarget();
    useAppStore.getState().completeTask('task-1', 'Shipped it.');
    expect(useAppStore.getState().cvEntries[0]?.status).toBe('pending');

    await syncNow({ pull: false });

    const body = calls[0]?.body as { cvEntries: unknown[] };
    expect(body.cvEntries).toEqual([]);
    // Still here locally, still queued for this device's generation.
    expect(useAppStore.getState().cvEntries).toHaveLength(1);
  });

  it('pushes on launch what a force-quit left dirty', async () => {
    const { calls } = useServer();
    addTarget();
    // As rehydrated after a kill: data on disk, flag still set, nothing pushed.
    expect(useAppStore.getState().sync.dirty).toBe(true);

    const stop = startSync();
    await flush();

    expect(calls.map((call) => call.method)).toEqual(['GET', 'PUT']);
    expect(useAppStore.getState().sync.dirty).toBe(false);
    stop();
  });

  it('merges and retries when another device wrote first', async () => {
    const { calls } = useServer();
    addTarget({ customTitle: 'mine' });
    server.seed({
      schemaVersion: 1,
      targets: [
        {
          id: 'other-device-target',
          roleId: 'data-analyst',
          level: 'entry-level',
          experience: 'From the laptop.',
          createdAt: new Date(REAL_NOW - DAY).toISOString(),
          updatedAt: new Date(REAL_NOW - DAY).toISOString(),
          roadmap: [],
          focusTaskIds: [],
        },
      ],
      cvEntries: [],
    });

    await syncNow({ pull: false });

    expect(calls.map((call) => call.method)).toEqual(['PUT', 'PUT']);
    const stored = server.get().body as { targets: Array<{ id: string }> };
    expect(stored.targets.map((target) => target.id)).toContain('other-device-target');
    expect(useAppStore.getState().targets).toHaveLength(2);
  });
});

describe('pull', () => {
  it('restores everything on a fresh device and opens the most recently updated target', async () => {
    useServer();
    const older = new Date(REAL_NOW - 2 * DAY).toISOString();
    const newer = new Date(REAL_NOW - DAY).toISOString();
    const base = { roleId: 'software-engineer', level: 'internship', experience: 'x', roadmap: [], focusTaskIds: [] };
    server.seed({
      schemaVersion: 1,
      targets: [
        { ...base, id: 'older', createdAt: older, updatedAt: older },
        { ...base, id: 'newer', createdAt: older, updatedAt: newer },
      ],
      cvEntries: [],
    });
    expect(useAppStore.getState().targets).toEqual([]);

    await syncNow({ pull: true });

    const state = useAppStore.getState();
    expect(state.targets.map((target) => target.id)).toEqual(['older', 'newer']);
    expect(state.activeTargetId).toBe('newer');
    // What came down is what the server has: nothing to push back.
    expect(state.sync.dirty).toBe(false);
  });

  it('leaves local data untouched when the server sends a snapshot it cannot read', async () => {
    configureSync({
      request: async () => ({ kind: 'ok', body: { schemaVersion: 1, serverUpdatedAt: 'v', targets: [{ id: 'broken' }], cvEntries: [] } }),
      isLinked: () => true,
    });
    addTarget();
    const before = useAppStore.getState().targets;

    await syncNow({ pull: true });

    expect(useAppStore.getState().targets).toBe(before);
    expect(useSyncStatus.getState().status).toBe('error');
  });

  it('stops without merging a snapshot from a newer app version', async () => {
    configureSync({
      request: async () => ({ kind: 'ok', body: { schemaVersion: 99, serverUpdatedAt: 'v', targets: [], cvEntries: [] } }),
      isLinked: () => true,
    });
    addTarget();
    const before = useAppStore.getState().targets;

    await syncNow({ pull: true });

    expect(useAppStore.getState().targets).toBe(before);
    expect(useSyncStatus.getState().status).toBe('update_required');
  });
});

describe('undo window', () => {
  const seedSyncedBullet = async (): Promise<string> => {
    addTarget();
    const targetId = useAppStore.getState().activeTargetId as string;
    const entryId = useAppStore.getState().addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'Built 1 API.' });
    await syncNow({ pull: false });
    return entryId;
  };

  it('keeps an item that was deleted then undone within the window', async () => {
    const { calls } = useServer();
    const stop = startSync();
    const entryId = await seedSyncedBullet();
    calls.length = 0;

    useAppStore.getState().deleteCvEntry(entryId);
    await flush(PUSH_DEBOUNCE_MS * 2);
    // Nothing goes out while the undo is on offer.
    expect(calls).toEqual([]);

    useAppStore.getState().undoDelete();
    await flush(PUSH_DEBOUNCE_MS);
    await syncNow({ pull: true });

    const stored = server.get().body as { cvEntries: Array<{ id: string; deletedAt?: string }> };
    expect(stored.cvEntries.find((entry) => entry.id === entryId)).not.toHaveProperty('deletedAt');
    expect(useAppStore.getState().cvEntries.map((entry) => entry.id)).toContain(entryId);
    expect(useAppStore.getState().tombstones.cvEntries).toEqual([]);
    stop();
  });

  it('sends the delete once the window closes uncancelled', async () => {
    const { calls } = useServer();
    const stop = startSync();
    const entryId = await seedSyncedBullet();
    calls.length = 0;

    useAppStore.getState().deleteCvEntry(entryId);
    await flush(PUSH_DEBOUNCE_MS * 2);
    expect(calls).toEqual([]);

    useAppStore.getState().clearPendingUndo();
    await flush(PUSH_DEBOUNCE_MS);
    await flush();

    const stored = server.get().body as { cvEntries: Array<{ id: string; deletedAt?: string }> };
    expect(stored.cvEntries.find((entry) => entry.id === entryId)).toHaveProperty('deletedAt');
    stop();
  });

  it('does not let a pull during the window bring the deleted item back', async () => {
    useServer();
    const stop = startSync();
    const entryId = await seedSyncedBullet();

    useAppStore.getState().deleteCvEntry(entryId);
    onForeground();
    await flush();

    expect(useAppStore.getState().cvEntries.map((entry) => entry.id)).not.toContain(entryId);
    stop();
  });

  it('closes an undo that its banner never cleared, then syncs', async () => {
    const { calls } = useServer();
    const stop = startSync();
    const entryId = await seedSyncedBullet();
    calls.length = 0;

    useAppStore.getState().deleteCvEntry(entryId);
    await flush(PUSH_DEBOUNCE_MS);
    expect(useAppStore.getState().pendingUndo).not.toBeNull();

    await flush(UNDO_SAFETY_MS);
    await flush(PUSH_DEBOUNCE_MS);

    expect(useAppStore.getState().pendingUndo).toBeNull();
    expect(calls.map((call) => call.method)).toContain('PUT');
    stop();
  });
});

describe('failures', () => {
  it('reports offline, keeps local data, and retries with backoff', async () => {
    let failures = 2;
    const { request } = transport(server);
    const calls: string[] = [];
    configureSync({
      isLinked: () => true,
      request: async (method, body) => {
        calls.push(method);
        if (failures > 0) {
          failures -= 1;
          throw new ApiError('network', 'Network request failed.');
        }
        return request(method, body);
      },
    });
    addTarget();
    const before = useAppStore.getState().targets;

    await syncNow({ pull: false });
    expect(useSyncStatus.getState().status).toBe('offline');
    expect(useAppStore.getState().targets).toBe(before);
    expect(useAppStore.getState().sync.dirty).toBe(true);

    await flush(BACKOFF_MS[0]);
    expect(calls).toHaveLength(2);
    await flush(BACKOFF_MS[1]);
    expect(calls).toHaveLength(3);
    expect(useSyncStatus.getState().status).toBe('idle');
    expect(useAppStore.getState().sync.dirty).toBe(false);
  });

  it('does not retry a snapshot over 900 KB', async () => {
    const calls: string[] = [];
    configureSync({
      isLinked: () => true,
      request: async (method) => {
        calls.push(method);
        throw new ApiError('invalid_response', 'Snapshot exceeds 900 KB.', 'SYNC_PAYLOAD_TOO_LARGE');
      },
    });
    addTarget();

    await syncNow({ pull: false });
    await flush(BACKOFF_MS[4] * 2);

    expect(calls).toHaveLength(1);
    expect(useSyncStatus.getState().status).toBe('too_large');
    expect(useAppStore.getState().targets).toHaveLength(1);
  });
});

describe('device clock', () => {
  it('surfaces a wrong date distinctly, does not retry in a loop, and recovers once fixed', async () => {
    const { calls } = useServer();
    const stop = startSync();
    await flush();
    calls.length = 0;

    // The phone thinks it is two days later than it is.
    vi.setSystemTime(REAL_NOW + 2 * DAY);
    addTarget();
    await flush(PUSH_DEBOUNCE_MS);
    await flush();

    expect(useSyncStatus.getState().status).toBe('clock_skew');
    expect(calls).toHaveLength(1);

    // No retry loop, and further edits do not hammer the server either.
    useAppStore.getState().startTask('task-1');
    await flush(BACKOFF_MS[4] * 3);
    expect(calls).toHaveLength(1);
    expect(useAppStore.getState().targets).toHaveLength(1);

    // The user fixes the date and comes back to the app.
    vi.setSystemTime(REAL_NOW + 60_000);
    onForeground();
    await flush();

    expect(useSyncStatus.getState().status).toBe('idle');
    const stored = server.get().body as { targets: Array<{ updatedAt: string }> };
    expect(Date.parse(stored.targets[0]?.updatedAt ?? '')).toBeLessThanOrEqual(REAL_NOW + 60_000);
    stop();
  });
});

describe('applying a pull is not a local change', () => {
  it('keeps the server stamps, leaves the dirty flag clear, and triggers no push', async () => {
    const { calls } = useServer();
    const stamp = new Date(REAL_NOW - DAY).toISOString();
    server.seed({
      schemaVersion: 1,
      targets: [
        { id: 'from-laptop', roleId: 'software-engineer', level: 'internship', experience: 'x', createdAt: stamp, updatedAt: stamp, roadmap: [], focusTaskIds: [] },
      ],
      cvEntries: [
        { id: 'bullet', targetId: 'from-laptop', taskId: 'k', status: 'ready', text: 'Built 1 API.', createdAt: stamp, updatedAt: stamp },
      ],
    });
    const stop = startSync();
    await flush();
    const revisionAfterPull = useAppStore.getState().sync.revision;

    const state = useAppStore.getState();
    expect(state.targets[0]?.updatedAt).toBe(stamp);
    expect(state.cvEntries[0]?.updatedAt).toBe(stamp);
    expect(state.sync.dirty).toBe(false);
    expect(revisionAfterPull).toBe(0);

    // Long after any debounce or backoff could fire: still only the one GET.
    await flush(PUSH_DEBOUNCE_MS * 10);
    await flush(BACKOFF_MS[4]);
    expect(calls.map((call) => call.method)).toEqual(['GET']);
    stop();
  });
});

describe('two devices with no edits', () => {
  type Device = Pick<ReturnType<typeof useAppStore.getState>, 'targets' | 'cvEntries' | 'tombstones' | 'sync' | 'activeTargetId'>;
  const capture = (): Device => {
    const { targets, cvEntries, tombstones, sync, activeTargetId } = useAppStore.getState();
    return { targets, cvEntries, tombstones, sync, activeTargetId };
  };
  /** Puts a device's saved state into the one store, as if that phone were open. */
  const open = (device: Device): void => {
    useAppStore.setState(device);
  };

  it('settle after one round trip, then make no further pushes or background requests', async () => {
    const { calls } = useServer();
    const stop = startSync();
    await flush();

    // Device A has data; device B is a fresh install.
    addTarget();
    let deviceA = capture();
    useAppStore.getState().resetAll();
    let deviceB = capture();

    // Round trip: A pushes, B pulls and restores.
    open(deviceA);
    await syncNow({ pull: true });
    deviceA = capture();
    open(deviceB);
    await syncNow({ pull: true });
    deviceB = capture();

    expect(calls.map((call) => call.method)).toEqual(['GET', 'GET', 'PUT', 'GET']);
    const settledVersion = deviceA.sync.baseServerUpdatedAt;
    expect(deviceB.sync.baseServerUpdatedAt).toBe(settledVersion);
    expect(deviceB.targets).toEqual(deviceA.targets);
    calls.length = 0;

    // Settled: alternate pulls only read; nothing is written back, nothing re-stamped.
    for (let round = 0; round < 3; round += 1) {
      open(deviceA);
      await syncNow({ pull: true });
      deviceA = capture();
      open(deviceB);
      await syncNow({ pull: true });
      deviceB = capture();
    }
    expect(calls.map((call) => call.method)).toEqual(Array(6).fill('GET'));
    expect(deviceA.sync).toMatchObject({ dirty: false, baseServerUpdatedAt: settledVersion });
    expect(deviceB.sync).toMatchObject({ dirty: false, baseServerUpdatedAt: settledVersion });
    expect(deviceB.targets).toEqual(deviceA.targets);
    calls.length = 0;

    // With nothing to trigger a pull, timers alone produce zero requests.
    await flush(PUSH_DEBOUNCE_MS * 10);
    await flush(BACKOFF_MS[4] * 2);
    expect(calls).toEqual([]);
    stop();
  });
});

describe('a response that arrives after a reset', () => {
  it('a pull in flight when the device is reset does not refill it', async () => {
    const stamp = new Date(REAL_NOW - DAY).toISOString();
    server.seed({
      schemaVersion: 1,
      targets: [{ id: 'from-cloud', roleId: 'software-engineer', level: 'internship', experience: 'x', createdAt: stamp, updatedAt: stamp, roadmap: [], focusTaskIds: [] }],
      cvEntries: [],
    });
    const { request } = transport(server);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    configureSync({
      isLinked: () => linked,
      request: async (method, body) => {
        const response = await request(method, body);
        await held;
        return response;
      },
    });

    const pulling = syncNow({ pull: true });
    await flush();
    await resetThisDevice();
    release();
    await pulling;

    expect(useAppStore.getState().targets).toEqual([]);
    expect(useAppStore.getState().sync.baseServerUpdatedAt).toBeNull();
    expect(useSyncStatus.getState().status).toBe('idle');
  });
});

describe('permanent sync errors say what would fix them', () => {
  it('a server that refuses our schema version asks for an update, and does not retry', async () => {
    const calls: string[] = [];
    configureSync({
      isLinked: () => true,
      request: async (method) => {
        calls.push(method);
        throw new ApiError('invalid_response', 'newer', 'SYNC_SCHEMA_UNSUPPORTED');
      },
    });
    addTarget();

    await syncNow({ pull: false });
    await flush(BACKOFF_MS[4] * 2);

    expect(useSyncStatus.getState().status).toBe('update_required');
    expect(calls).toHaveLength(1);
    expect(useAppStore.getState().targets).toHaveLength(1);
  });
});

describe('over the sync count limits', () => {
  const failWith = (code: string, calls: string[]) =>
    configureSync({
      isLinked: () => true,
      request: async (method) => {
        calls.push(method);
        throw new ApiError('invalid_response', 'refused', code);
      },
    });

  it('SYNC_LIMIT_EXCEEDED becomes over_limit and is not retried', async () => {
    const calls: string[] = [];
    failWith('SYNC_LIMIT_EXCEEDED', calls);
    addTarget();

    await syncNow({ pull: false });
    await flush(BACKOFF_MS[4] * 2);

    expect(useSyncStatus.getState().status).toBe('over_limit');
    expect(calls).toHaveLength(1);
    expect(useAppStore.getState().targets).toHaveLength(1);
  });

  it('INVALID_SYNC_INPUT becomes over_limit when the live counts are at a limit', async () => {
    const calls: string[] = [];
    failWith('INVALID_SYNC_INPUT', calls);
    addTarget({
      roadmap: Array.from({ length: 200 }, (_, index) => ({
        id: `m${index}`, title: `Build ${index} thing`, doneWhen: 'Done', steps: [], estimatedWeeks: 2, priority: 2 as const, status: 'not_started' as const,
      })),
    });

    await syncNow({ pull: false });
    await flush(BACKOFF_MS[4] * 2);

    expect(useSyncStatus.getState().status).toBe('over_limit');
    expect(calls).toHaveLength(1);
  });

  it('INVALID_SYNC_INPUT stays a plain error when the counts are well under every limit', async () => {
    const calls: string[] = [];
    failWith('INVALID_SYNC_INPUT', calls);
    addTarget();

    await syncNow({ pull: false });

    expect(useSyncStatus.getState().status).toBe('error');
  });

  it('counts only live records: a pile of deleted targets does not make INVALID_SYNC_INPUT an over-limit', async () => {
    const calls: string[] = [];
    failWith('INVALID_SYNC_INPUT', calls);
    for (let index = 0; index < 55; index += 1) {
      const id = addTarget();
      useAppStore.getState().removeTarget(id);
    }
    addTarget();
    useAppStore.getState().clearPendingUndo();

    await syncNow({ pull: false });

    expect(useAppStore.getState().tombstones.targets.length).toBeGreaterThanOrEqual(55);
    expect(useSyncStatus.getState().status).toBe('error');
  });
});
