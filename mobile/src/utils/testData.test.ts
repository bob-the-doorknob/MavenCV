import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({ map: new Map<string, string>(), writes: [] as string[] }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      disk.writes.push(key);
      disk.map.set(key, value);
    },
    removeItem: async (key: string) => {
      disk.map.delete(key);
    },
  },
}));

import { RECOVERY_KEY, STORAGE_KEY, migrate, useAppStore } from '../store/useAppStore';
import { devTestDataAvailable, loadTestData } from '../services/localData';
import { setSimulateLinkedAccount } from '../services/syncAccount';
import { generateTestData, TEST_DATA_COUNTS } from './testData';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const isIso = (value: string | undefined): boolean => typeof value === 'string' && new Date(Date.parse(value)).toISOString() === value;

describe('the guard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hides the row when __DEV__ is false, and when it is undefined', () => {
    vi.stubGlobal('__DEV__', false);
    expect(devTestDataAvailable()).toBe(false);
    vi.stubGlobal('__DEV__', undefined);
    expect(devTestDataAvailable()).toBe(false);
  });

  it('shows it in a development build', () => {
    vi.stubGlobal('__DEV__', true);
    expect(devTestDataAvailable()).toBe(true);
  });

  it('refuses to load, and changes nothing, when __DEV__ is false', () => {
    vi.stubGlobal('__DEV__', false);
    const before = useAppStore.getState().targets;
    expect(() => loadTestData(NOW)).toThrow(/development builds/);
    expect(useAppStore.getState().targets).toBe(before);
  });
});

describe('generated data shape', () => {
  const data = generateTestData(NOW, 'run1');
  const tasks = data.targets.flatMap((target) => target.roadmap);

  it('has the counts asked for', () => {
    expect(data.targets).toHaveLength(TEST_DATA_COUNTS.targets);
    expect(data.targets.map((target) => target.roadmap.length).sort((a, b) => b - a)[0]).toBe(20);
    const big = data.targets.find((target) => target.roadmap.length === 20);
    expect(big?.roadmap.every((task) => task.steps.length === 10)).toBe(true);
    expect(data.cvEntries).toHaveLength(500);
    expect(data.cvEntries.every((entry) => entry.status === 'ready' && entry.text.trim().length > 0)).toBe(true);
  });

  it('spreads bullets across every target, each pointing at a finished milestone of its own target', () => {
    for (const target of data.targets) {
      const mine = data.cvEntries.filter((entry) => entry.targetId === target.id);
      expect(mine.length).toBeGreaterThan(0);
      const done = new Set(target.roadmap.filter((task) => task.status === 'done').map((task) => task.id));
      expect(mine.every((entry) => done.has(entry.taskId))).toBe(true);
    }
  });

  it('uses unique ids everywhere, and new ones per run', () => {
    const ids = [
      ...data.targets.map((target) => target.id),
      ...tasks.map((task) => task.id),
      ...tasks.flatMap((task) => task.steps.map((step) => step.id)),
      ...data.cvEntries.map((entry) => entry.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const again = generateTestData(NOW, 'run2');
    expect(again.targets.some((target) => data.targets.some((other) => other.id === target.id))).toBe(false);
  });

  it('mixes statuses and has overdue milestones', () => {
    const big = data.targets[0]?.roadmap ?? [];
    expect(new Set(big.map((task) => task.status))).toEqual(new Set(['done', 'in_progress', 'not_started']));
    const overdue = big.filter((task) => task.status !== 'done' && Date.parse(task.targetDate ?? '') < NOW);
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.some((task) => task.status === 'not_started')).toBe(false); // milestone 10 is due exactly now, not before
    expect(overdue.every((task) => task.status === 'in_progress')).toBe(true);
    expect(big.some((task) => Date.parse(task.targetDate ?? '') > NOW)).toBe(true);
  });

  it('has valid statuses, priorities, estimates and dates, consistent with each status', () => {
    for (const task of tasks) {
      expect(['not_started', 'in_progress', 'done']).toContain(task.status);
      expect([1, 2, 3]).toContain(task.priority);
      expect(task.estimatedWeeks).toBeGreaterThanOrEqual(1);
      expect(task.estimatedWeeks).toBeLessThanOrEqual(8);
      expect(isIso(task.targetDate)).toBe(true);
      expect(task.status === 'done').toBe(task.completedAt !== undefined);
      if (task.completedAt) expect(isIso(task.completedAt)).toBe(true);
      if (task.status === 'done') expect(task.steps.every((step) => step.done)).toBe(true);
      for (const step of task.steps) expect(step.done).toBe(step.completedAt !== undefined);
    }
    for (const target of data.targets) {
      expect(isIso(target.createdAt) && isIso(target.updatedAt)).toBe(true);
      const open = new Set(target.roadmap.filter((task) => task.status !== 'done').map((task) => task.id));
      expect(target.focusTaskIds.length).toBeLessThanOrEqual(2);
      expect(target.focusTaskIds.every((id) => open.has(id))).toBe(true);
    }
    expect(data.cvEntries.every((entry) => isIso(entry.createdAt) && isIso(entry.updatedAt))).toBe(true);
  });

  it('passes the load-time normalisation unchanged', () => {
    const migrated = migrate(JSON.parse(JSON.stringify({ targets: data.targets, activeTargetId: data.targets[0]?.id, cvEntries: data.cvEntries })));
    expect(migrated.targets).toEqual(data.targets);
    expect(migrated.cvEntries).toEqual(data.cvEntries);
  });
});

describe('loading it into the store', () => {
  beforeEach(async () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'true');
    useAppStore.getState().resetAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    disk.map.clear();
    disk.writes.length = 0;
  });
  afterEach(() => {
    setSimulateLinkedAccount(false);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('replaces the data through the stamping path, in one persisted write, without touching any copy', async () => {
    const oldId = useAppStore.getState().addTarget({ roleId: 'software-engineer', level: 'internship', experience: 'mine' });
    disk.map.set(RECOVERY_KEY, 'recovery bytes');
    disk.map.set(`${STORAGE_KEY}-pre-migration-v1`, 'v1 bytes');
    await new Promise((resolve) => setTimeout(resolve, 0));
    disk.writes.length = 0;
    const revision = useAppStore.getState().sync.revision;

    loadTestData(NOW);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = useAppStore.getState();
    expect(state.targets).toHaveLength(3);
    expect(state.cvEntries).toHaveLength(500);
    expect(state.activeTargetId).toBe(state.targets[0]?.id);
    // Stamped like any change: dirty, revision bumped, the replaced target tombstoned.
    expect(state.sync).toMatchObject({ dirty: true, revision: revision + 1 });
    expect(state.tombstones.targets.map((tomb) => tomb.id)).toContain(oldId);
    expect(state.targets.every((target) => Date.parse(target.updatedAt) >= NOW)).toBe(true);
    // Written once, by the store's own persistence, to the store key only.
    expect(disk.writes).toEqual([STORAGE_KEY]);
    expect(disk.map.get(RECOVERY_KEY)).toBe('recovery bytes');
    expect(disk.map.get(`${STORAGE_KEY}-pre-migration-v1`)).toBe('v1 bytes');
    // And what is in memory is exactly what a reload would produce.
    const reloaded = migrate(JSON.parse(disk.map.get(STORAGE_KEY) as string).state);
    expect(reloaded.targets).toEqual(state.targets);
    expect(reloaded.cvEntries).toEqual(state.cvEntries);
  });

  it('is refused for a linked account, so test data never syncs into a real one', () => {
    setSimulateLinkedAccount(true);
    const before = useAppStore.getState().targets;
    expect(() => loadTestData(NOW)).toThrow(/Sign out/);
    expect(useAppStore.getState().targets).toBe(before);
  });
});
