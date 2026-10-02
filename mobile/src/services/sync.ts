import { create } from 'zustand';

import { emptySyncMeta, parseIncomingRecords, useAppStore, useStorageStatus } from '../store/useAppStore';
import { SYNC_SCHEMA_VERSION, stripForPush, toRecords, type SyncRecords } from '../utils/syncMerge';
import { ApiError, requestSync, type SyncHttpResult } from './api';
import { isLinkedAccount } from './syncAccount';

/**
 * Local-first cloud sync (docs/sync-contract.md). The store stays the source
 * of truth on this device; this module only ever adds to it through the
 * merge, never blocks a screen on the network, and never discards local data
 * because a request failed.
 *
 * - Push: debounced ~3 s after a local change.
 * - Pull: on app foreground, at launch, and right after sign-in.
 * - Retry: exponential backoff for transient failures; none for input the
 *   server rejected, or a wrong device clock.
 * - Dirty flag: lives in the persisted store, written in the same save as
 *   the change, so a force-quit is pushed on next launch.
 * - Undo: nothing syncs while an undo is on offer, so a delete reaches the
 *   server only once the undo window has closed uncancelled.
 */

/** 'clock_skew': the server refused our timestamps — the device date is wrong. */
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'clock_skew';

export const useSyncStatus = create<{ status: SyncStatus; lastSyncedAt: string | null }>(() => ({
  status: 'idle',
  lastSyncedAt: null,
}));

export const PUSH_DEBOUNCE_MS = 3_000;
export const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000] as const;
/**
 * Longest an undo can plausibly still be on offer. The banner only clears
 * the store's pendingUndo when its timer fires; if the screen unmounts first
 * it never does, and sync must not wait forever on an undo nobody can see.
 */
export const UNDO_SAFETY_MS = 15_000;

export interface SyncDeps {
  request: (method: 'GET' | 'PUT', body?: unknown) => Promise<SyncHttpResult>;
  isLinked: () => boolean;
  now: () => number;
}

// `now` reads Date.now at call time, not at import time, so it follows the real clock.
const defaultDeps: SyncDeps = { request: requestSync, isLinked: isLinkedAccount, now: () => Date.now() };
let deps: SyncDeps = defaultDeps;

/** Tests swap the transport, the account check and the clock. */
export const configureSync = (overrides: Partial<SyncDeps>): void => {
  deps = { ...defaultDeps, ...overrides };
};

let running = false;
let queued: { pull: boolean } | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let undoTimer: ReturnType<typeof setTimeout> | null = null;
let backoffIndex = 0;
/** Set by a clock rejection. Only a foreground (the user may have fixed the date) lifts it. */
let blockedUntilForeground = false;

class StopSync extends Error {
  public constructor(public readonly status: SyncStatus) {
    super(status);
  }
}

interface RemoteSnapshot {
  records: SyncRecords;
  serverUpdatedAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseSnapshot = (value: unknown): RemoteSnapshot => {
  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== 'number' ||
    !(value.serverUpdatedAt === null || typeof value.serverUpdatedAt === 'string') ||
    !Array.isArray(value.targets) ||
    !Array.isArray(value.cvEntries)
  ) {
    throw new ApiError('invalid_response', 'Sync snapshot was malformed.');
  }
  // A newer app wrote this. Merging it could drop fields this build does not
  // know, so stop and keep everything local as it is.
  if (value.schemaVersion > SYNC_SCHEMA_VERSION) throw new StopSync('error');
  const records = parseIncomingRecords(value.targets, value.cvEntries);
  if (!records) throw new ApiError('invalid_response', 'Sync snapshot held an invalid record.');
  return { records, serverUpdatedAt: value.serverUpdatedAt };
};

const setStatus = (status: SyncStatus): void => {
  useSyncStatus.setState({ status, lastSyncedAt: useAppStore.getState().sync.lastSyncedAt });
};

const clearTimer = (timer: ReturnType<typeof setTimeout> | null): null => {
  if (timer) clearTimeout(timer);
  return null;
};

/**
 * Nothing syncs while an undo is on offer. If the window somehow never
 * closes (see UNDO_SAFETY_MS), close it here: an undo offered after the
 * delete reached the server could not work, because tombstones are terminal.
 */
const waitForUndo = (): void => {
  const offered = useAppStore.getState().pendingUndo;
  if (!offered || undoTimer) return;
  undoTimer = setTimeout(() => {
    undoTimer = null;
    if (useAppStore.getState().pendingUndo === offered) {
      useAppStore.getState().clearPendingUndo();
    }
  }, UNDO_SAFETY_MS);
};

const undoOnOffer = (): boolean => {
  if (!useAppStore.getState().pendingUndo) return false;
  waitForUndo();
  return true;
};

const markSynced = (): void => {
  backoffIndex = 0;
  retryTimer = clearTimer(retryTimer);
  useAppStore.getState().setSyncMeta({ lastSyncedAt: new Date(deps.now()).toISOString() });
  setStatus('idle');
};

const scheduleRetry = (pull: boolean): void => {
  const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0];
  backoffIndex += 1;
  retryTimer = clearTimer(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow({ pull });
  }, delay);
};

const handleError = (error: unknown, pull: boolean): void => {
  if (error instanceof StopSync) {
    setStatus(error.status);
    return;
  }
  if (!(error instanceof ApiError)) {
    // Misconfiguration (no backend URL, say). Retrying cannot fix it.
    setStatus('error');
    return;
  }
  if (error.code === 'SYNC_CLOCK_SKEW') {
    blockedUntilForeground = true;
    setStatus('clock_skew');
    return;
  }
  if (error.code === 'SYNC_ACCOUNT_REQUIRED' || error.kind === 'invalid_response' || error.kind === 'consent_required') {
    setStatus('error');
    return;
  }
  setStatus(error.kind === 'network' ? 'offline' : 'error');
  scheduleRetry(pull);
};

/** PUT, and on 409 merge the server's snapshot and try once more. */
const push = async (): Promise<void> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (undoOnOffer()) return;
    // Bring stamps written by a wrong clock back into range first.
    useAppStore.getState().repairFutureStamps(deps.now());
    const state = useAppStore.getState();
    const revision = state.sync.revision;
    const result = await deps.request('PUT', {
      schemaVersion: SYNC_SCHEMA_VERSION,
      ...stripForPush(toRecords(state)),
      baseServerUpdatedAt: state.sync.baseServerUpdatedAt,
    });

    if (result.kind === 'ok') {
      const stored = parseSnapshot(result.body);
      // Anything changed while the request was out still needs pushing.
      const changedMeanwhile = useAppStore.getState().sync.revision !== revision;
      useAppStore.getState().setSyncMeta({ baseServerUpdatedAt: stored.serverUpdatedAt, dirty: changedMeanwhile });
      if (changedMeanwhile) schedulePush();
      return;
    }

    const conflictBody = isRecord(result.body) ? result.body.snapshot : undefined;
    const remote = parseSnapshot(conflictBody);
    if (undoOnOffer()) return;
    const needsPush = useAppStore.getState().mergeRemote(remote.records, remote.serverUpdatedAt);
    if (!needsPush) return;
  }
  // Two conflicts in a row: someone else is writing. Back off rather than race.
  throw new ApiError('server', 'Sync kept conflicting.');
};

const run = async (pull: boolean): Promise<void> => {
  if (!deps.isLinked()) {
    setStatus('idle');
    return;
  }
  if (!useStorageStatus.getState().ready) return;
  if (blockedUntilForeground) return;
  if (undoOnOffer()) return;
  if (!pull && !useAppStore.getState().sync.dirty) return;

  setStatus('syncing');
  try {
    if (pull) {
      const result = await deps.request('GET');
      const remote = parseSnapshot(result.body);
      // An undo may have been offered while the request was out.
      if (undoOnOffer()) {
        setStatus('idle');
        return;
      }
      const needsPush = useAppStore.getState().mergeRemote(remote.records, remote.serverUpdatedAt);
      if (needsPush) await push();
    } else {
      await push();
    }
    if (useAppStore.getState().pendingUndo) {
      setStatus('idle');
      return;
    }
    markSynced();
  } catch (error) {
    handleError(error, pull);
  }
};

/** Runs one sync, or folds the request into the one already running. Never throws. */
export const syncNow = async ({ pull }: { pull: boolean }): Promise<void> => {
  if (running) {
    queued = { pull: pull || (queued?.pull ?? false) };
    return;
  }
  running = true;
  try {
    await run(pull);
  } finally {
    running = false;
    const next = queued;
    queued = null;
    if (next) void syncNow(next);
  }
};

/** Debounced push: one request per burst of edits, ~3 s after the last. */
export const schedulePush = (): void => {
  if (blockedUntilForeground || !deps.isLinked()) return;
  pushTimer = clearTimer(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void syncNow({ pull: false });
  }, PUSH_DEBOUNCE_MS);
};

/** App came to the foreground: the one event that may lift a clock block. */
export const onForeground = (): void => {
  blockedUntilForeground = false;
  void syncNow({ pull: true });
};

/** Call after the user signs in with (or links) a real account. */
export const onAccountLinked = (): void => {
  blockedUntilForeground = false;
  void syncNow({ pull: true });
};

/**
 * Wires sync to the store. Returns a stop function. `subscribeToForeground`
 * is injected so this file stays free of React Native imports and testable
 * under node; App.tsx passes AppState.
 */
export const startSync = (subscribeToForeground?: (onActive: () => void) => () => void): (() => void) => {
  setStatus('idle');

  const unsubscribeStore = useAppStore.subscribe((state, previous) => {
    if (state.sync.revision !== previous.sync.revision) schedulePush();
    // The undo window closed. If it closed uncancelled, the delete is still
    // dirty and goes now; if it was undone, the restore is what goes.
    if (previous.pendingUndo && !state.pendingUndo) {
      undoTimer = clearTimer(undoTimer);
      if (state.sync.dirty) schedulePush();
    }
  });
  const unsubscribeForeground = subscribeToForeground?.(onForeground) ?? (() => {});

  // Launch counts as a foreground. A push the last session never finished
  // is still marked dirty and rides along with this pull.
  void syncNow({ pull: true });

  return () => {
    unsubscribeStore();
    unsubscribeForeground();
    pushTimer = clearTimer(pushTimer);
    retryTimer = clearTimer(retryTimer);
    undoTimer = clearTimer(undoTimer);
  };
};

/** Test-only: forget timers, flags and the injected dependencies. */
export const resetSyncForTests = (): void => {
  pushTimer = clearTimer(pushTimer);
  retryTimer = clearTimer(retryTimer);
  undoTimer = clearTimer(undoTimer);
  running = false;
  queued = null;
  backoffIndex = 0;
  blockedUntilForeground = false;
  deps = defaultDeps;
  useSyncStatus.setState({ status: 'idle', lastSyncedAt: emptySyncMeta.lastSyncedAt });
};
