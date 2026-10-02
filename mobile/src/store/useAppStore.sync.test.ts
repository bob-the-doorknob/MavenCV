import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { migrate, stampChanges, useAppStore, type PersistedAppState } from './useAppStore';

const T0 = Date.parse('2026-10-02T12:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

const addTarget = (): string =>
  useAppStore.getState().addTarget({
    roleId: 'software-engineer',
    level: 'internship',
    experience: 'Two class projects.',
    roadmap: [
      { id: 'task-1', title: 'Build 1 API', doneWhen: 'Deployed', steps: [], estimatedWeeks: 2, priority: 2, status: 'not_started' },
    ],
  });

const active = (): Target => {
  const state = useAppStore.getState();
  return state.targets.find((target) => target.id === state.activeTargetId) as Target;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useAppStore.getState().resetAll();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('stamping every mutation', () => {
  it('stamps a new target and marks the data dirty', () => {
    addTarget();
    expect(active().updatedAt).toBe(iso(T0));
    expect(useAppStore.getState().sync).toMatchObject({ dirty: true, revision: 1 });
  });

  it('re-stamps a target when any action changes it', () => {
    addTarget();
    vi.setSystemTime(T0 + 5_000);

    useAppStore.getState().startTask('task-1');

    expect(active().updatedAt).toBe(iso(T0 + 5_000));
    expect(useAppStore.getState().sync.revision).toBe(2);
  });

  it('never stamps earlier than before, even if the clock went back', () => {
    addTarget();
    vi.setSystemTime(T0 - 60_000);

    useAppStore.getState().recordCheckIn();

    expect(active().updatedAt).toBe(iso(T0 + 1));
  });

  it('leaves the stamp and the dirty flag alone when nothing really changed', () => {
    addTarget();
    useAppStore.getState().setSyncMeta({ dirty: false });
    const before = active();
    vi.setSystemTime(T0 + 5_000);

    // Already in progress? No — start it once, then "start" it again.
    useAppStore.getState().startTask('task-1');
    const afterFirst = active();
    useAppStore.getState().setSyncMeta({ dirty: false });
    useAppStore.getState().startTask('task-1');

    expect(afterFirst).not.toBe(before);
    expect(active()).toBe(afterFirst);
    expect(useAppStore.getState().sync.dirty).toBe(false);
  });

  it('stamps a CV entry when the queue fills it in', () => {
    addTarget();
    const entryId = useAppStore.getState().addCvEntry({ targetId: active().id, taskId: 'task-1', status: 'pending', text: '' });
    vi.setSystemTime(T0 + 9_000);

    useAppStore.getState().updateCvEntry(entryId, { status: 'ready', text: 'Built 1 API.' });

    expect(useAppStore.getState().cvEntries[0]?.updatedAt).toBe(iso(T0 + 9_000));
  });

  it('does not count switching targets as a change to sync', () => {
    addTarget();
    useAppStore.getState().setSyncMeta({ dirty: false });
    useAppStore.getState().setActiveTarget(null);
    expect(useAppStore.getState().sync.dirty).toBe(false);
  });
});

describe('tombstones', () => {
  it('records a deleted target and its bullets', () => {
    const targetId = addTarget();
    useAppStore.getState().addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'Built 1 API.' });
    vi.setSystemTime(T0 + 1_000);

    useAppStore.getState().removeTarget(targetId);

    const { tombstones } = useAppStore.getState();
    expect(tombstones.targets).toEqual([{ id: targetId, updatedAt: iso(T0 + 1_000), deletedAt: iso(T0 + 1_000) }]);
    expect(tombstones.cvEntries).toHaveLength(1);
  });

  it('takes the tombstone away again when a delete is undone', () => {
    const targetId = addTarget();
    const entryId = useAppStore.getState().addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'Built 1 API.' });

    useAppStore.getState().deleteCvEntry(entryId);
    expect(useAppStore.getState().tombstones.cvEntries.map((tomb) => tomb.id)).toEqual([entryId]);

    useAppStore.getState().undoDelete();
    expect(useAppStore.getState().tombstones.cvEntries).toEqual([]);
    expect(useAppStore.getState().cvEntries.map((entry) => entry.id)).toEqual([entryId]);
  });

  it('keeps the tombstone for a delete that is not undone', () => {
    const targetId = addTarget();
    const entryId = useAppStore.getState().addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'Built 1 API.' });

    useAppStore.getState().deleteCvEntry(entryId);
    useAppStore.getState().clearPendingUndo();

    expect(useAppStore.getState().tombstones.cvEntries.map((tomb) => tomb.id)).toEqual([entryId]);
  });
});

describe('stampChanges', () => {
  const state = (overrides: Partial<PersistedAppState> = {}): PersistedAppState => ({
    targets: [],
    activeTargetId: null,
    cvEntries: [],
    onboardingDraft: null,
    tombstones: { targets: [], cvEntries: [] },
    sync: { dirty: false, revision: 7, baseServerUpdatedAt: 'v1', lastSyncedAt: null, ownerUid: null },
    ...overrides,
  });

  it('passes a patch that touches no synced data through untouched', () => {
    const current = state();
    expect(stampChanges(current, { activeTargetId: 'x' }, T0)).toEqual({ activeTargetId: 'x' });
  });
});

describe('migrating data saved before sync', () => {
  it('falls back to createdAt for missing stamps and starts clean', () => {
    const migrated = migrate({
      targets: [
        { id: 't', roleId: 'software-engineer', level: 'internship', experience: 'x', createdAt: '2026-01-01T00:00:00.000Z', roadmap: [] },
      ],
      activeTargetId: 't',
      cvEntries: [
        { id: 'e', targetId: 't', taskId: 'k', status: 'ready', text: 'x', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    });

    expect(migrated.targets[0]?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(migrated.cvEntries[0]?.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(migrated.tombstones).toEqual({ targets: [], cvEntries: [] });
    expect(migrated.sync).toEqual({ dirty: false, revision: 0, baseServerUpdatedAt: null, lastSyncedAt: null, ownerUid: null });
  });

  it('drops a malformed tombstone instead of refusing to load', () => {
    const migrated = migrate({
      targets: [],
      activeTargetId: null,
      cvEntries: [],
      tombstones: { targets: [{ id: 'ok', updatedAt: 'a', deletedAt: 'a' }, { id: 'broken' }], cvEntries: 'nope' },
      sync: { dirty: 'yes', revision: 3 },
    });

    expect(migrated.tombstones).toEqual({ targets: [{ id: 'ok', updatedAt: 'a', deletedAt: 'a' }], cvEntries: [] });
    expect(migrated.sync).toEqual({ dirty: false, revision: 3, baseServerUpdatedAt: null, lastSyncedAt: null, ownerUid: null });
  });
});

describe('mergeRemote', () => {
  it('re-merges against the store as it is now, keeping an edit made mid-request', () => {
    addTarget();
    const remoteTarget = { ...active(), id: 'remote-target', updatedAt: iso(T0 - 1_000) };
    // The request went out; meanwhile the user started a task.
    useAppStore.getState().startTask('task-1');

    const needsPush = useAppStore.getState().mergeRemote({ targets: [remoteTarget], cvEntries: [] }, 'v2');

    expect(active().roadmap[0]?.status).toBe('in_progress');
    expect(useAppStore.getState().targets).toHaveLength(2);
    expect(needsPush).toBe(true);
    expect(useAppStore.getState().sync.baseServerUpdatedAt).toBe('v2');
  });

  it('does not count as a local change itself', () => {
    const revision = useAppStore.getState().sync.revision;
    useAppStore.getState().mergeRemote({ targets: [], cvEntries: [] }, 'v1');
    expect(useAppStore.getState().sync.revision).toBe(revision);
  });
});

describe('resetAll', () => {
  it('wipes this device only: no tombstones, so the account copy is left alone', () => {
    addTarget();
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().targets).toEqual([]);
    expect(useAppStore.getState().tombstones).toEqual({ targets: [], cvEntries: [] });
    expect(useAppStore.getState().sync.dirty).toBe(false);
  });
});

describe('a bullet that arrives while its entry is held for undo', () => {
  it('is kept on the held entry, so undoing a deleted milestone restores it finished', () => {
    addTarget();
    useAppStore.getState().completeTask('task-1', 'Shipped it.');
    const entryId = useAppStore.getState().cvEntries[0]?.id as string;
    // Not ready yet, so deleting the milestone takes the entry with it, held for undo.
    useAppStore.getState().updateCvEntry(entryId, { status: 'failed' });
    useAppStore.getState().updateCvEntry(entryId, { status: 'pending' });
    useAppStore.getState().deleteTask('task-1');
    expect(useAppStore.getState().cvEntries).toEqual([]);

    // The generation that was already running finishes now.
    useAppStore.getState().updateCvEntry(entryId, { status: 'ready', text: 'Built 1 API.' });
    useAppStore.getState().undoDelete();

    const restored = useAppStore.getState().cvEntries.find((entry) => entry.id === entryId);
    expect(restored).toMatchObject({ status: 'ready', text: 'Built 1 API.' });
  });

  it('does the same for a deleted bullet', () => {
    const targetId = addTarget();
    const entryId = useAppStore.getState().addCvEntry({ targetId, taskId: 'task-1', status: 'pending', text: '' });
    useAppStore.getState().deleteCvEntry(entryId);

    useAppStore.getState().updateCvEntry(entryId, { status: 'ready', text: 'Built 1 API.' });
    useAppStore.getState().undoDelete();

    expect(useAppStore.getState().cvEntries[0]).toMatchObject({ id: entryId, status: 'ready' });
  });

  it('is dropped once the undo has gone, without resurrecting anything', () => {
    const targetId = addTarget();
    const entryId = useAppStore.getState().addCvEntry({ targetId, taskId: 'task-1', status: 'pending', text: '' });
    useAppStore.getState().deleteCvEntry(entryId);
    useAppStore.getState().clearPendingUndo();

    useAppStore.getState().updateCvEntry(entryId, { status: 'ready', text: 'Built 1 API.' });

    expect(useAppStore.getState().cvEntries).toEqual([]);
  });
});

describe('the onboarding draft', () => {
  it('is cleared in the same write that adds the target it produced', () => {
    useAppStore.getState().saveOnboardingDraft({
      step: 'readyBy', roleId: 'software-engineer', customTitle: '', level: 'internship',
      employer: '', experience: 'x', targetDate: null, savedAt: '2026-10-02T00:00:00.000Z',
    });
    const states: Array<{ targets: number; draft: boolean }> = [];
    const unsubscribe = useAppStore.subscribe((state) =>
      states.push({ targets: state.targets.length, draft: state.onboardingDraft !== null }),
    );

    addTarget();
    unsubscribe();

    // One change: there is never a moment with the target saved and the draft still there.
    expect(states).toEqual([{ targets: 1, draft: false }]);
  });
});
