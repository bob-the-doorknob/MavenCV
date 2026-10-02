import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({ map: new Map<string, string>(), failWrites: false, writes: [] as string[] }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (disk.failWrites) throw new Error('ENOSPC');
      disk.writes.push(key);
      disk.map.set(key, value);
    },
    removeItem: async (key: string) => {
      disk.map.delete(key);
    },
  },
}));

import {
  LEGACY_BACKUP_KEY,
  PRE_MIGRATION_KEY_PREFIX,
  RECOVERY_KEY,
  STORAGE_KEY,
  savePreMigrationCopy,
  useAppStore,
  useStorageStatus,
  writeState,
} from '../store/useAppStore';
import { corruptSavedData, deleteLocalCopies, devCorruptionAvailable, localCopyKeys, resetThisDevice, startFresh } from './localData';
import { stripForPush, toRecords } from '../utils/syncMerge';

const addTarget = () =>
  useAppStore.getState().addTarget({ roleId: 'software-engineer', level: 'internship', experience: 'x' });

const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  useAppStore.getState().resetAll();
  await flushWrites();
  disk.map.clear();
  disk.writes.length = 0;
  disk.failWrites = false;
  useStorageStatus.setState({ ready: true, error: null, writeFailed: false });
});

afterEach(() => {
  disk.failWrites = false;
});

describe('saving', () => {
  it('writes the store once per action, with the needs-pushing flag in the same write', async () => {
    addTarget();
    await flushWrites();

    expect(disk.writes).toEqual([STORAGE_KEY]);
    const saved = JSON.parse(disk.map.get(STORAGE_KEY) as string) as { state: { targets: unknown[]; sync: { dirty: boolean } } };
    expect(saved.state.targets).toHaveLength(1);
    expect(saved.state.sync.dirty).toBe(true);
    expect(disk.map.has(LEGACY_BACKUP_KEY)).toBe(false);
  });

  it('records a failed write for the UI instead of throwing, and clears it on the next good one', async () => {
    disk.failWrites = true;
    await expect(writeState(STORAGE_KEY, '{}')).resolves.toBeUndefined();
    expect(useStorageStatus.getState().writeFailed).toBe(true);

    disk.failWrites = false;
    await writeState(STORAGE_KEY, '{}');
    expect(useStorageStatus.getState().writeFailed).toBe(false);
  });

  it('keeps working in memory while writes fail', async () => {
    disk.failWrites = true;
    addTarget();
    await flushWrites();
    expect(useAppStore.getState().targets).toHaveLength(1);
    expect(useStorageStatus.getState().writeFailed).toBe(true);
  });
});

describe('pre-migration copy', () => {
  const payload = (version?: number) => JSON.stringify({ state: { targets: [] }, ...(version === undefined ? {} : { version }) });

  it('is written once, for a stored version older than the build', async () => {
    await savePreMigrationCopy(payload(1), 2);
    expect(disk.map.get(`${PRE_MIGRATION_KEY_PREFIX}1`)).toBe(payload(1));
  });

  it('is never overwritten, so a failed migration cannot replace it', async () => {
    await savePreMigrationCopy(payload(1), 2);
    const later = JSON.stringify({ state: { targets: ['changed'] }, version: 1 });
    await savePreMigrationCopy(later, 2);
    expect(disk.map.get(`${PRE_MIGRATION_KEY_PREFIX}1`)).toBe(payload(1));
  });

  it('is not written for the current version, or for data it cannot read', async () => {
    await savePreMigrationCopy(payload(2), 2);
    await savePreMigrationCopy('not json', 2);
    expect([...disk.map.keys()].some((key) => key.startsWith(PRE_MIGRATION_KEY_PREFIX))).toBe(false);
  });

  it('treats unversioned data as older than any build', async () => {
    await savePreMigrationCopy(payload(), 1);
    expect(disk.map.has(`${PRE_MIGRATION_KEY_PREFIX}0`)).toBe(true);
  });
});

describe('start fresh', () => {
  it('sets the unreadable data aside, then clears the store', async () => {
    disk.map.set(STORAGE_KEY, '{"state": broken');

    await startFresh();

    expect(disk.map.get(RECOVERY_KEY)).toBe('{"state": broken');
    expect(disk.map.get(STORAGE_KEY)).not.toBe('{"state": broken');
    expect(useAppStore.getState().targets).toEqual([]);
  });

  it('clears nothing if the data cannot be set aside', async () => {
    disk.map.set(STORAGE_KEY, 'raw');
    disk.failWrites = true;

    await expect(startFresh()).rejects.toThrow();

    expect(disk.map.get(STORAGE_KEY)).toBe('raw');
  });
});

describe('local copies', () => {
  const seedCopies = () => {
    for (const key of localCopyKeys()) disk.map.set(key, 'old copy');
    disk.map.set(RECOVERY_KEY, 'recovered');
  };

  it('are never part of what sync sends', () => {
    seedCopies();
    addTarget();
    const sent = JSON.stringify(stripForPush(toRecords(useAppStore.getState())));
    expect(sent).not.toContain('old copy');
    expect(sent).not.toContain('recovered');
  });

  it('are all deleted by deleteLocalCopies', async () => {
    seedCopies();
    await deleteLocalCopies();
    for (const key of localCopyKeys()) expect(disk.map.has(key)).toBe(false);
  });

  it('are deleted by Reset all data', async () => {
    seedCopies();
    addTarget();
    await resetThisDevice();
    expect(useAppStore.getState().targets).toEqual([]);
    for (const key of [RECOVERY_KEY, LEGACY_BACKUP_KEY, `${PRE_MIGRATION_KEY_PREFIX}0`]) expect(disk.map.has(key)).toBe(false);
  });
});

describe('the dev "Corrupt saved data" tool', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is hidden when __DEV__ is false, so a release build never shows the row', () => {
    vi.stubGlobal('__DEV__', false);
    expect(devCorruptionAvailable()).toBe(false);
  });

  it('is hidden when __DEV__ does not exist at all', () => {
    vi.stubGlobal('__DEV__', undefined);
    expect(devCorruptionAvailable()).toBe(false);
  });

  it('is shown in a development build', () => {
    vi.stubGlobal('__DEV__', true);
    expect(devCorruptionAvailable()).toBe(true);
  });

  it('refuses to run, and writes nothing, when __DEV__ is false', async () => {
    vi.stubGlobal('__DEV__', false);
    disk.map.set(STORAGE_KEY, '{"state":{},"version":2}');
    await expect(corruptSavedData()).rejects.toThrow(/development builds/);
    expect(disk.map.get(STORAGE_KEY)).toBe('{"state":{},"version":2}');
  });

  it('writes invalid JSON to the store key and leaves every other copy exactly as it was', async () => {
    vi.stubGlobal('__DEV__', true);
    disk.map.set(STORAGE_KEY, '{"state":{},"version":2}');
    disk.map.set(RECOVERY_KEY, 'recovery bytes');
    disk.map.set(`${PRE_MIGRATION_KEY_PREFIX}1`, 'v1 bytes');

    await corruptSavedData();

    expect(() => JSON.parse(disk.map.get(STORAGE_KEY) as string)).toThrow();
    expect(disk.map.get(RECOVERY_KEY)).toBe('recovery bytes');
    expect(disk.map.get(`${PRE_MIGRATION_KEY_PREFIX}1`)).toBe('v1 bytes');
  });

  it('leads to the could-not-load state on the next launch, with no pre-migration copy made', async () => {
    vi.stubGlobal('__DEV__', true);
    await corruptSavedData();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await useAppStore.persist.rehydrate();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useStorageStatus.getState().error).toContain('could not be loaded');
    expect([...disk.map.keys()].some((key) => key.startsWith(PRE_MIGRATION_KEY_PREFIX))).toBe(false);
  });
});
