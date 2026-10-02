import { describe, expect, it } from 'vitest';

import type { CvEntry, CvEntryTombstone, RoadmapTask, Target, TargetTombstone } from '../types';
import {
  TOMBSTONE_RETENTION_MS,
  canonicalJson,
  chooseActiveTargetId,
  clampFutureStamps,
  fromRecords,
  mergeSnapshots,
  monotonicStamp,
  pickWinner,
  recordsEqual,
  restoreDeviceLocalFields,
  stripForPush,
  stripIncoming,
  toRecords,
  type SyncRecords,
} from './syncMerge';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const at = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();
const MINUTE = 60_000;

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: 'Deployed and linked from the CV',
  steps: [],
  estimatedWeeks: 2,
  priority: 2,
  status: 'not_started',
  ...overrides,
});

const target = (overrides: Partial<Target> = {}): Target => ({
  id: 'target-1',
  roleId: 'software-engineer',
  level: 'internship',
  experience: 'Two class projects.',
  createdAt: at(-60 * MINUTE),
  updatedAt: at(0),
  roadmap: [task()],
  focusTaskIds: [],
  ...overrides,
});

const targetTomb = (overrides: Partial<TargetTombstone> = {}): TargetTombstone => ({
  id: 'target-1',
  updatedAt: at(0),
  deletedAt: at(0),
  ...overrides,
});

const entry = (overrides: Partial<CvEntry> = {}): CvEntry => ({
  id: 'entry-1',
  targetId: 'target-1',
  taskId: 'task-1',
  status: 'ready',
  text: 'Built 1 portfolio project.',
  createdAt: at(-30 * MINUTE),
  updatedAt: at(0),
  ...overrides,
});

const entryTomb = (overrides: Partial<CvEntryTombstone> = {}): CvEntryTombstone => ({
  id: 'entry-1',
  targetId: 'target-1',
  updatedAt: at(0),
  deletedAt: at(0),
  ...overrides,
});

const records = (overrides: Partial<SyncRecords> = {}): SyncRecords => ({
  targets: [],
  cvEntries: [],
  ...overrides,
});

/** Both directions must agree — that is what makes two devices converge. */
const mergeBothWays = (a: SyncRecords, b: SyncRecords, now = NOW): SyncRecords => {
  const ab = mergeSnapshots(a, b, now);
  const ba = mergeSnapshots(b, a, now);
  expect(recordsEqual(ab, ba)).toBe(true);
  return ab;
};

describe('mergeSnapshots — targets', () => {
  it('keeps a target only one side has, from either side', () => {
    const merged = mergeBothWays(
      records({ targets: [target({ id: 'a' })] }),
      records({ targets: [target({ id: 'b' })] }),
    );
    expect(merged.targets.map((record) => record.id).sort()).toEqual(['a', 'b']);
  });

  it('takes the newer target whole, roadmap included', () => {
    const older = target({ updatedAt: at(0), roadmap: [task({ title: 'Old title' })] });
    const newer = target({ updatedAt: at(1_000), roadmap: [task({ title: 'New title' }), task({ id: 'task-2' })] });

    const merged = mergeBothWays(records({ targets: [older] }), records({ targets: [newer] }));

    expect(merged.targets).toEqual([newer]);
  });

  it('does not mix milestones from two versions of the same target', () => {
    const local = target({ updatedAt: at(0), roadmap: [task({ id: 'only-local' })] });
    const remote = target({ updatedAt: at(5), roadmap: [task({ id: 'only-remote' })] });

    const merged = mergeSnapshots(records({ targets: [local] }), records({ targets: [remote] }), NOW);

    expect((merged.targets[0] as Target).roadmap.map((item) => item.id)).toEqual(['only-remote']);
  });

  it('keeps an identical target exactly once', () => {
    const same = target();
    const merged = mergeBothWays(records({ targets: [same] }), records({ targets: [same] }));
    expect(merged.targets).toEqual([same]);
  });

  it('collapses a duplicated id within one side', () => {
    const merged = mergeSnapshots(records({ targets: [target(), target()] }), records(), NOW);
    expect(merged.targets).toHaveLength(1);
  });

  it('lets a readable stamp beat an unreadable one', () => {
    const broken = target({ updatedAt: 'not a date', experience: 'broken' });
    const good = target({ updatedAt: at(-1_000_000), experience: 'good' });

    const merged = mergeBothWays(records({ targets: [broken] }), records({ targets: [good] }));

    expect((merged.targets[0] as Target).experience).toBe('good');
  });

  it('keeps local order first, then remote-only targets in their order', () => {
    const merged = mergeSnapshots(
      records({ targets: [target({ id: 'l2' }), target({ id: 'l1' })] }),
      records({ targets: [target({ id: 'r1' }), target({ id: 'l1' }), target({ id: 'r2' })] }),
      NOW,
    );
    expect(merged.targets.map((record) => record.id)).toEqual(['l2', 'l1', 'r1', 'r2']);
  });
});

describe('mergeSnapshots — tombstones are terminal', () => {
  it('deletes a target that the other side still has live', () => {
    const merged = mergeBothWays(
      records({ targets: [targetTomb({ updatedAt: at(0) })] }),
      records({ targets: [target({ updatedAt: at(-1_000) })] }),
    );
    expect(merged.targets).toEqual([targetTomb({ updatedAt: at(0) })]);
  });

  it('keeps the delete even when the live copy was edited later', () => {
    const merged = mergeBothWays(
      records({ targets: [targetTomb({ updatedAt: at(0) })] }),
      records({ targets: [target({ updatedAt: at(10 * MINUTE) })] }),
    );
    expect(merged.targets).toEqual([targetTomb({ updatedAt: at(0) })]);
  });

  it('is not resurrected by a stale device that never saw the delete', () => {
    // Device A deleted and synced; device B was offline with an old copy.
    const server = records({ targets: [targetTomb()] });
    const staleDevice = records({ targets: [target({ updatedAt: at(-24 * 60 * MINUTE) })] });

    const merged = mergeSnapshots(staleDevice, server, NOW);

    expect(merged.targets.every((record) => 'deletedAt' in record)).toBe(true);
  });

  it('keeps a tombstone only one side has', () => {
    const merged = mergeBothWays(records({ targets: [targetTomb()] }), records());
    expect(merged.targets).toEqual([targetTomb()]);
  });

  it('settles two tombstones for the same id by their stamps', () => {
    const merged = mergeBothWays(
      records({ targets: [targetTomb({ updatedAt: at(0), deletedAt: at(0) })] }),
      records({ targets: [targetTomb({ updatedAt: at(9), deletedAt: at(9) })] }),
    );
    expect(merged.targets).toEqual([targetTomb({ updatedAt: at(9), deletedAt: at(9) })]);
  });

  it('applies the same rule to CV entries', () => {
    const merged = mergeBothWays(
      records({ cvEntries: [entryTomb({ updatedAt: at(0) })] }),
      records({ cvEntries: [entry({ updatedAt: at(MINUTE), text: 'Edited after the delete' })] }),
    );
    expect(merged.cvEntries).toEqual([entryTomb({ updatedAt: at(0) })]);
  });
});

describe('mergeSnapshots — CV entries', () => {
  it('unions entries by id', () => {
    const merged = mergeBothWays(
      records({ cvEntries: [entry({ id: 'a' })] }),
      records({ cvEntries: [entry({ id: 'b' })] }),
    );
    expect(merged.cvEntries.map((record) => record.id).sort()).toEqual(['a', 'b']);
  });

  it('takes the newer version of the same entry', () => {
    const merged = mergeBothWays(
      records({ cvEntries: [entry({ updatedAt: at(0), text: 'Old' })] }),
      records({ cvEntries: [entry({ updatedAt: at(1), text: 'New' })] }),
    );
    expect((merged.cvEntries[0] as CvEntry).text).toBe('New');
  });

  it('deletes the bullets of a deleted target', () => {
    const merged = mergeBothWays(
      records({ targets: [targetTomb({ updatedAt: at(5), deletedAt: at(5) })] }),
      records({ targets: [target()], cvEntries: [entry({ id: 'a' }), entry({ id: 'b' })] }),
    );
    expect(merged.cvEntries).toEqual([
      { id: 'a', targetId: 'target-1', updatedAt: at(5), deletedAt: at(5) },
      { id: 'b', targetId: 'target-1', updatedAt: at(5), deletedAt: at(5) },
    ]);
  });

  it('leaves bullets of other targets alone when one target is deleted', () => {
    const merged = mergeSnapshots(
      records({ targets: [targetTomb({ id: 'gone' }), target({ id: 'kept' })] }),
      records({ cvEntries: [entry({ id: 'x', targetId: 'kept' })] }),
      NOW,
    );
    expect(merged.cvEntries).toEqual([entry({ id: 'x', targetId: 'kept' })]);
  });

  it('keeps an entry tombstone that already existed rather than re-deriving it', () => {
    const own = entryTomb({ updatedAt: at(-MINUTE), deletedAt: at(-MINUTE) });
    const merged = mergeSnapshots(
      records({ targets: [targetTomb({ updatedAt: at(0) })], cvEntries: [own] }),
      records(),
      NOW,
    );
    expect(merged.cvEntries).toEqual([own]);
  });
});

describe('mergeSnapshots — identical timestamps', () => {
  it('picks the same winner whichever side is local', () => {
    const a = target({ updatedAt: at(0), experience: 'Version A' });
    const b = target({ updatedAt: at(0), experience: 'Version B' });

    expect(pickWinner(a, b)).toBe(pickWinner(b, a));
    mergeBothWays(records({ targets: [a] }), records({ targets: [b] }));
  });

  it('breaks the tie by canonical JSON, later sorts win', () => {
    const a = target({ updatedAt: at(0), experience: 'aaa' });
    const b = target({ updatedAt: at(0), experience: 'zzz' });
    expect(pickWinner(a, b)).toBe(b);
  });

  it('still lets a tombstone win a tie against a live record', () => {
    const merged = mergeBothWays(
      records({ cvEntries: [entryTomb({ updatedAt: at(0) })] }),
      records({ cvEntries: [entry({ updatedAt: at(0) })] }),
    );
    expect(merged.cvEntries).toEqual([entryTomb({ updatedAt: at(0) })]);
  });

  it('does not depend on key order inside a record', () => {
    const a = target({ updatedAt: at(0), experience: 'same' });
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as Target;
    expect(canonicalJson(a)).toBe(canonicalJson(reordered));
  });
});

describe('clock skew of a few minutes', () => {
  it('lets an edit made after seeing a record win, even on a slow clock', () => {
    // Device A runs 3 minutes fast and wrote the record.
    const fromFastDevice = target({ updatedAt: at(3 * MINUTE), experience: 'from A' });
    // Device B's clock is correct. It pulled A's version, then edited at
    // real time +1 minute — earlier than A's stamp.
    const stamp = monotonicStamp(fromFastDevice.updatedAt, NOW + MINUTE);
    const editedOnSlowDevice = { ...fromFastDevice, updatedAt: stamp, experience: 'from B' };

    const merged = mergeBothWays(
      records({ targets: [editedOnSlowDevice] }),
      records({ targets: [fromFastDevice] }),
    );

    expect((merged.targets[0] as Target).experience).toBe('from B');
  });

  it('lets the faster clock win a true race — the accepted cost', () => {
    // Neither device saw the other's edit; B really edited later.
    const a = target({ updatedAt: at(3 * MINUTE), experience: 'A, 3 min fast' });
    const b = target({ updatedAt: at(2 * MINUTE), experience: 'B, correct clock, later' });

    const merged = mergeBothWays(records({ targets: [a] }), records({ targets: [b] }));

    expect((merged.targets[0] as Target).experience).toBe('A, 3 min fast');
  });

  it('never moves a stamp backwards', () => {
    expect(monotonicStamp(at(5 * MINUTE), NOW)).toBe(at(5 * MINUTE + 1));
    expect(monotonicStamp(at(-5 * MINUTE), NOW)).toBe(at(0));
    expect(monotonicStamp(undefined, NOW)).toBe(at(0));
  });

  it('does not let skew on one target affect another', () => {
    const merged = mergeBothWays(
      records({ targets: [target({ id: 'a', updatedAt: at(4 * MINUTE) })] }),
      records({ targets: [target({ id: 'b', updatedAt: at(-4 * MINUTE) })] }),
    );
    expect(merged.targets).toHaveLength(2);
  });
});

describe('tombstone retention', () => {
  it('forgets tombstones older than the retention window', () => {
    const old = targetTomb({ deletedAt: at(-TOMBSTONE_RETENTION_MS - 1), updatedAt: at(-TOMBSTONE_RETENTION_MS - 1) });
    const merged = mergeSnapshots(records({ targets: [old] }), records(), NOW);
    expect(merged.targets).toEqual([]);
  });

  it('keeps tombstones inside the window', () => {
    const recent = targetTomb({ deletedAt: at(-TOMBSTONE_RETENTION_MS + MINUTE), updatedAt: at(-TOMBSTONE_RETENTION_MS + MINUTE) });
    const merged = mergeSnapshots(records({ targets: [recent] }), records(), NOW);
    expect(merged.targets).toEqual([recent]);
  });
});

describe('convergence', () => {
  it('reaches the same records whichever device merges first', () => {
    const deviceA = records({
      targets: [target({ id: 't1', updatedAt: at(2) }), targetTomb({ id: 't2', updatedAt: at(1) }), target({ id: 't3' })],
      cvEntries: [entry({ id: 'e1', targetId: 't1', updatedAt: at(9) }), entry({ id: 'e2', targetId: 't2' })],
    });
    const deviceB = records({
      targets: [target({ id: 't1', updatedAt: at(7), experience: 'B' }), target({ id: 't2', updatedAt: at(50) })],
      cvEntries: [entry({ id: 'e1', targetId: 't1', updatedAt: at(3) }), entryTomb({ id: 'e3', targetId: 't3' })],
    });

    const merged = mergeBothWays(deviceA, deviceB);
    // Merging again changes nothing.
    expect(recordsEqual(mergeSnapshots(merged, deviceB, NOW), merged)).toBe(true);
  });
});

describe('local shape conversions', () => {
  it('round-trips store data through records', () => {
    const data = {
      targets: [target()],
      cvEntries: [entry()],
      tombstones: { targets: [targetTomb({ id: 'old' })], cvEntries: [entryTomb({ id: 'old-entry' })] },
    };
    expect(fromRecords(toRecords(data))).toEqual(data);
  });

  it('keeps pending bullets and notification ids on the device', () => {
    const pushed = stripForPush(
      records({
        targets: [target({ roadmap: [task({ notificationId: 'os-notification-7' })] }), targetTomb({ id: 'gone' })],
        cvEntries: [entry({ id: 'p', status: 'pending', text: '' }), entry({ id: 'r' }), entryTomb({ id: 't' })],
      }),
    );
    expect((pushed.targets[0] as Target).roadmap[0]).not.toHaveProperty('notificationId');
    expect(pushed.targets[1]).toEqual(targetTomb({ id: 'gone' }));
    expect(pushed.cvEntries.map((record) => record.id)).toEqual(['r', 't']);
  });

  it('drops pending bullets arriving from elsewhere', () => {
    const incoming = stripIncoming(records({ cvEntries: [entry({ status: 'pending', text: '' }), entry({ id: 'ok' })] }));
    expect(incoming.cvEntries.map((record) => record.id)).toEqual(['ok']);
  });

  it('puts this device notification ids back onto merged targets', () => {
    const local = [target({ roadmap: [task({ notificationId: 'n-1' })] })];
    const merged = [target({ updatedAt: at(9), roadmap: [task({ title: 'Renamed elsewhere' })] })];

    const restored = restoreDeviceLocalFields(local, merged);

    expect(restored[0]?.roadmap[0]).toMatchObject({ title: 'Renamed elsewhere', notificationId: 'n-1' });
  });
});

describe('chooseActiveTargetId', () => {
  it('keeps the current target when it still exists', () => {
    expect(chooseActiveTargetId('a', [target({ id: 'a', updatedAt: at(0) }), target({ id: 'b', updatedAt: at(9) })])).toBe('a');
  });

  it('picks the most recently updated target on a fresh device', () => {
    const targets = [
      target({ id: 'old', updatedAt: at(-MINUTE) }),
      target({ id: 'newest', updatedAt: at(MINUTE) }),
      target({ id: 'middle', updatedAt: at(0) }),
    ];
    expect(chooseActiveTargetId(null, targets)).toBe('newest');
  });

  it('moves off a target that was deleted elsewhere', () => {
    expect(chooseActiveTargetId('deleted', [target({ id: 'b', updatedAt: at(1) })])).toBe('b');
  });

  it('is null when there is nothing to show', () => {
    expect(chooseActiveTargetId('a', [])).toBeNull();
  });
});

describe('recordsEqual', () => {
  it('ignores order', () => {
    const a = records({ targets: [target({ id: 'x' }), target({ id: 'y' })] });
    const b = records({ targets: [target({ id: 'y' }), target({ id: 'x' })] });
    expect(recordsEqual(a, b)).toBe(true);
  });

  it('notices a changed field', () => {
    expect(
      recordsEqual(records({ targets: [target()] }), records({ targets: [target({ experience: 'changed' })] })),
    ).toBe(false);
  });
});

describe('clampFutureStamps', () => {
  const HOUR = 60 * MINUTE;
  const data = (updatedAt: string, createdAt = at(-HOUR)) => ({
    targets: [target({ updatedAt, createdAt })],
    cvEntries: [entry({ updatedAt, createdAt })],
    tombstones: { targets: [targetTomb({ id: 'gone', updatedAt, deletedAt: updatedAt })], cvEntries: [] },
  });

  it('brings stamps from a clock that ran ahead back to now', () => {
    const repaired = clampFutureStamps(data(at(2 * 24 * HOUR), at(2 * 24 * HOUR)), NOW);
    expect(repaired.targets[0]).toMatchObject({ updatedAt: at(0), createdAt: at(0) });
    expect(repaired.cvEntries[0]).toMatchObject({ updatedAt: at(0), createdAt: at(0) });
    expect(repaired.tombstones.targets[0]).toMatchObject({ updatedAt: at(0), deletedAt: at(0) });
  });

  it('leaves a few minutes of skew alone, and returns the same object', () => {
    const input = data(at(5 * MINUTE));
    expect(clampFutureStamps(input, NOW)).toBe(input);
  });

  it('changes nothing while the clock is still wrong — the server keeps refusing', () => {
    const wrongNow = NOW + 2 * 24 * HOUR;
    const input = data(new Date(wrongNow).toISOString());
    expect(clampFutureStamps(input, wrongNow)).toBe(input);
  });
});
