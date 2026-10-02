import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({ map: new Map<string, string>(), writes: [] as string[], failKey: null as string | null }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (disk.failKey === key) throw new Error('ENOSPC');
      disk.writes.push(key);
      disk.map.set(key, value);
    },
    removeItem: async (key: string) => {
      disk.map.delete(key);
    },
  },
}));

import { RECOVERY_KEY, STORAGE_KEY, STORE_VERSION, loadErrorMessage, migrateStoredState, useAppStore, useStorageStatus } from './useAppStore';
import { deleteLocalCopies, localCopyKeys, resetThisDevice, startFresh } from '../services/localData';
import { stripForPush, toRecords } from '../utils/syncMerge';

const V1_COPY = `${STORAGE_KEY}-pre-migration-v1`;
const V0_COPY = `${STORAGE_KEY}-pre-migration-v0`;

/** Exactly what a pre-sync build saved: no updatedAt, no tombstones, no sync. Byte-for-byte as stored. */
const V1_RAW =
  '{"state":{"targets":[{"id":"t1","roleId":"software-engineer","level":"internship","experience":"Two class projects.",' +
  '"createdAt":"2026-05-01T08:00:00.000Z","focusTaskIds":["k1"],"roadmap":[{"id":"k1","title":"Build 1 API","doneWhen":"Deployed",' +
  '"priority":2,"status":"done","completedAt":"2026-05-03T08:00:00.000Z","notes":"Shipped it.","steps":[],"estimatedWeeks":2}]}],' +
  '"activeTargetId":"t1","cvEntries":[{"id":"e1","targetId":"t1","taskId":"k1","status":"ready","text":"Built 1 API.",' +
  '"createdAt":"2026-05-03T08:01:00.000Z"}],"onboardingDraft":null},"version":1}';

const launch = async (): Promise<void> => {
  await useAppStore.persist.rehydrate();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const stored = (): { state: Record<string, unknown>; version: number } =>
  JSON.parse(disk.map.get(STORAGE_KEY) as string) as { state: Record<string, unknown>; version: number };

beforeEach(async () => {
  disk.map.clear();
  disk.failKey = null;
  useAppStore.getState().resetAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
  disk.map.clear();
  disk.writes.length = 0;
  useStorageStatus.setState({ ready: false, error: null, writeFailed: false });
});

describe('first launch after the update, from version 1', () => {
  it('copies the raw stored bytes once, before anything else', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();

    expect(disk.map.get(V1_COPY)).toBe(V1_RAW);
    expect(disk.writes[0]).toBe(V1_COPY);
  });

  it('loads the data normalised', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();

    const state = useAppStore.getState();
    expect(useStorageStatus.getState()).toMatchObject({ ready: true, error: null });
    expect(state.targets[0]).toMatchObject({ id: 't1', updatedAt: '2026-05-01T08:00:00.000Z' });
    expect(state.targets[0]?.roadmap[0]).toMatchObject({ weight: 2 });
    expect(state.cvEntries[0]).toMatchObject({ id: 'e1', updatedAt: '2026-05-03T08:01:00.000Z' });
    expect(state.tombstones).toEqual({ targets: [], cvEntries: [] });
    expect(state.activeTargetId).toBe('t1');
  });

  it('writes the new shape back as version 2, without marking anything to push', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();

    const saved = stored();
    expect(STORE_VERSION).toBe(2);
    expect(saved.version).toBe(2);
    expect(saved.state).toHaveProperty('tombstones');
    expect(saved.state.sync).toMatchObject({ dirty: false, revision: 0 });
    expect(useAppStore.getState().sync.dirty).toBe(false);
  });

  it('writes no new copy on the second launch', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();
    disk.writes.length = 0;

    await launch();

    expect(disk.writes).not.toContain(V1_COPY);
    expect(disk.map.get(V1_COPY)).toBe(V1_RAW);
  });
});

describe('the copy survives failures', () => {
  it('stays intact, and the stored data untouched, when the migration fails', async () => {
    const broken = '{"state":{"targets":"not a list","activeTargetId":null,"cvEntries":[]},"version":1}';
    disk.map.set(STORAGE_KEY, broken);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await launch();

    expect(useStorageStatus.getState().error).not.toBeNull();
    expect(disk.map.get(V1_COPY)).toBe(broken);
    expect(disk.map.get(STORAGE_KEY)).toBe(broken);
  });

  it('is never overwritten by a later load of different data', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();
    disk.map.set(STORAGE_KEY, V1_RAW.replace('Two class projects.', 'Changed later.'));

    await launch();

    expect(disk.map.get(V1_COPY)).toBe(V1_RAW);
  });

  it('refuses to migrate, writes nothing, and says storage may be full, if the copy cannot be saved', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    disk.failKey = V1_COPY;

    await launch();

    const message = useStorageStatus.getState().error ?? '';
    expect(message).toContain('storage may be full');
    expect(message).toContain('Free up some space, then retry');
    expect(disk.writes).not.toContain(STORAGE_KEY);
    expect(disk.map.get(STORAGE_KEY)).toBe(V1_RAW);
  });

  it('keeps the generic message for a load that fails for another reason', async () => {
    disk.map.set(STORAGE_KEY, '{"state":{"targets":"not a list","activeTargetId":null,"cvEntries":[]},"version":2}');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await launch();

    expect(useStorageStatus.getState().error).toBe(loadErrorMessage(new Error('anything else')));
    expect(useStorageStatus.getState().error).not.toContain('storage may be full');
  });

  it('refuses data from a newer version rather than misreading it', () => {
    expect(() => migrateStoredState({}, STORE_VERSION + 1)).toThrow(/newer version/);
  });
});

describe('the copy stays on the device', () => {
  it('is never what sync sends: sync reads only the live store', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();
    useAppStore.getState().removeTarget('t1');

    const sent = stripForPush(toRecords(useAppStore.getState()));

    expect(disk.map.get(V1_COPY)).toContain('Two class projects.');
    expect(sent.targets.every((record) => 'deletedAt' in record)).toBe(true);
    expect(JSON.stringify(sent)).not.toContain('Two class projects.');
  });

  it('is removed by Reset all data', async () => {
    disk.map.set(STORAGE_KEY, V1_RAW);
    await launch();
    await resetThisDevice();
    expect(disk.map.has(V1_COPY)).toBe(false);
  });

  it('is kept by Start fresh, along with the recovery copy it sets aside', async () => {
    disk.map.set(V1_COPY, V1_RAW);
    disk.map.set(V0_COPY, 'older copy');
    disk.map.set(STORAGE_KEY, 'unreadable');
    await startFresh();
    expect(disk.map.get(V1_COPY)).toBe(V1_RAW);
    expect(disk.map.get(V0_COPY)).toBe('older copy');
    expect(disk.map.get(RECOVERY_KEY)).toBe('unreadable');
  });

  it('is removed, with every other copy, by the wipe all three wipe paths share', async () => {
    for (const key of localCopyKeys()) disk.map.set(key, 'copy');
    await deleteLocalCopies();
    for (const key of localCopyKeys()) expect(disk.map.has(key)).toBe(false);
    expect(localCopyKeys()).toEqual(expect.arrayContaining([V0_COPY, V1_COPY, RECOVERY_KEY]));
  });
});

describe('data saved before versioning', () => {
  it('gets a v0 copy and still loads', async () => {
    const unversioned = V1_RAW.replace(',"version":1}', '}');
    disk.map.set(STORAGE_KEY, unversioned);

    await launch();

    expect(disk.map.get(V0_COPY)).toBe(unversioned);
    expect(useStorageStatus.getState()).toMatchObject({ ready: true, error: null });
    expect(useAppStore.getState().targets[0]).toMatchObject({ id: 't1', updatedAt: '2026-05-01T08:00:00.000Z' });
  });
});
