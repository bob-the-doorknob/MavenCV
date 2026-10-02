import type {
  CvEntry,
  CvEntryTombstone,
  RoadmapTask,
  Target,
  TargetTombstone,
  Tombstones,
} from '../types';

/**
 * The pure half of cloud sync: how two snapshots of the same user's data
 * combine. No I/O, no clock reads — `now` is always passed in — so both
 * devices running this on the same records reach the same answer.
 *
 * The policy is docs/sync-contract.md §7:
 * - a target is last-write-wins as a whole, roadmap included;
 * - CV entries merge by id, newer wins;
 * - a tombstone beats a live record whatever the timestamps;
 * - identical timestamps are broken by canonical JSON, symmetrically.
 */

export const SYNC_SCHEMA_VERSION = 1;

/** Tombstones older than this may be forgotten (contract §7, "Tombstone retention"). */
export const TOMBSTONE_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;

export type TargetRecord = Target | TargetTombstone;
export type CvEntryRecord = CvEntry | CvEntryTombstone;

export interface SyncRecords {
  targets: TargetRecord[];
  cvEntries: CvEntryRecord[];
}

/** The slice of local state sync reads and writes. */
export interface LocalSyncData {
  targets: Target[];
  cvEntries: CvEntry[];
  tombstones: Tombstones;
}

interface Stamped {
  id: string;
  updatedAt: string;
}

export const isTombstone = <T extends Stamped>(
  record: T | (Stamped & { deletedAt: string }),
): record is Stamped & { deletedAt: string } =>
  typeof (record as { deletedAt?: unknown }).deletedAt === 'string';

/** An unreadable stamp sorts first, so a record with a real one always beats it. */
const timeOf = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** JSON with object keys sorted at every depth, so equal data gives equal text. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/**
 * Which of two versions of the same record survives. Symmetric:
 * `pickWinner(a, b)` and `pickWinner(b, a)` return the same record.
 */
export const pickWinner = <T extends Stamped>(a: T, b: T): T => {
  const aDeleted = isTombstone(a);
  const bDeleted = isTombstone(b);
  // Terminal tombstones: deleting is the deliberate act, so it wins outright.
  if (aDeleted !== bDeleted) {
    return aDeleted ? a : b;
  }
  const aTime = timeOf(a.updatedAt);
  const bTime = timeOf(b.updatedAt);
  if (aTime !== bTime) {
    return aTime > bTime ? a : b;
  }
  // Same moment, same kind: any rule works as long as both devices agree.
  return canonicalJson(a) >= canonicalJson(b) ? a : b;
};

/** Union by id. Local order first, then anything only the remote has, in its order. */
const mergeById = <T extends Stamped>(local: readonly T[], remote: readonly T[]): T[] => {
  const remoteById = new Map(remote.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const record of local) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const other = remoteById.get(record.id);
    merged.push(other ? pickWinner(record, other) : record);
  }
  for (const record of remote) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    merged.push(record);
  }
  return merged;
};

/**
 * Deleting a target deletes its bullets, as it does on the phone. Derived
 * from the target's own tombstone so every device derives the same one.
 */
const cascadeTargetDeletes = (
  targets: readonly TargetRecord[],
  cvEntries: readonly CvEntryRecord[],
): CvEntryRecord[] => {
  const deleted = new Map<string, TargetTombstone>();
  for (const target of targets) {
    if (isTombstone(target)) deleted.set(target.id, target);
  }
  if (deleted.size === 0) return [...cvEntries];

  return cvEntries.map((entry) => {
    const targetTombstone = deleted.get(entry.targetId);
    if (!targetTombstone || isTombstone(entry)) return entry;
    return {
      id: entry.id,
      targetId: entry.targetId,
      updatedAt: targetTombstone.updatedAt,
      deletedAt: targetTombstone.deletedAt,
    };
  });
};

const isExpired = (record: Stamped & { deletedAt: string }, now: number): boolean =>
  now - timeOf(record.deletedAt) > TOMBSTONE_RETENTION_MS;

const pruneTombstones = <T extends Stamped>(records: readonly T[], now: number): T[] =>
  records.filter((record) => !isTombstone(record) || !isExpired(record, now));

/** Merges two snapshots per the contract. Pure; `now` only decides tombstone expiry. */
export const mergeSnapshots = (local: SyncRecords, remote: SyncRecords, now: number): SyncRecords => {
  const targets = pruneTombstones(mergeById(local.targets, remote.targets), now);
  const cvEntries = pruneTombstones(
    cascadeTargetDeletes(targets, mergeById(local.cvEntries, remote.cvEntries)),
    now,
  );
  return { targets, cvEntries };
};

/** Store shape to records: live first, in store order, then tombstones. */
export const toRecords = (data: LocalSyncData): SyncRecords => ({
  targets: [...data.targets, ...data.tombstones.targets],
  cvEntries: [...data.cvEntries, ...data.tombstones.cvEntries],
});

export const fromRecords = (records: SyncRecords): LocalSyncData => {
  const targets: Target[] = [];
  const targetTombstones: TargetTombstone[] = [];
  for (const record of records.targets) {
    if (isTombstone(record)) targetTombstones.push(record);
    else targets.push(record);
  }
  const cvEntries: CvEntry[] = [];
  const cvTombstones: CvEntryTombstone[] = [];
  for (const record of records.cvEntries) {
    if (isTombstone(record)) cvTombstones.push(record);
    else cvEntries.push(record);
  }
  return { targets, cvEntries, tombstones: { targets: targetTombstones, cvEntries: cvTombstones } };
};

const withoutNotificationId = (task: RoadmapTask): RoadmapTask => {
  const { notificationId: _deviceLocal, ...rest } = task;
  return rest;
};

/**
 * What leaves the device. A pending CV entry is generating here — sending it
 * would make another device generate it again — and a notification id only
 * means something to the OS that scheduled it.
 */
export const stripForPush = (records: SyncRecords): SyncRecords => ({
  targets: records.targets.map((target) =>
    isTombstone(target) ? target : { ...target, roadmap: target.roadmap.map(withoutNotificationId) },
  ),
  cvEntries: records.cvEntries.filter((entry) => isTombstone(entry) || entry.status !== 'pending'),
});

/**
 * Defensive mirror of stripForPush for what arrives: a pending entry from
 * another device would be picked up by this device's CV queue and sent to
 * Gemini a second time.
 */
export const stripIncoming = (records: SyncRecords): SyncRecords => ({
  targets: records.targets,
  cvEntries: records.cvEntries.filter((entry) => isTombstone(entry) || entry.status !== 'pending'),
});

/**
 * A merged target may have come from another device and so lack this
 * device's notification ids. Put them back by task id; the notification is
 * still scheduled here, and losing its id would make it uncancellable.
 */
export const restoreDeviceLocalFields = (localTargets: readonly Target[], merged: readonly Target[]): Target[] => {
  const notificationIds = new Map<string, string>();
  for (const target of localTargets) {
    for (const task of target.roadmap) {
      if (task.notificationId) notificationIds.set(task.id, task.notificationId);
    }
  }
  if (notificationIds.size === 0) return [...merged];

  return merged.map((target) => {
    let changed = false;
    const roadmap = target.roadmap.map((task) => {
      const notificationId = notificationIds.get(task.id);
      if (!notificationId || task.notificationId) return task;
      changed = true;
      return { ...task, notificationId };
    });
    return changed ? { ...target, roadmap } : target;
  });
};

/**
 * Keeps the current target when it still exists. Otherwise — a fresh device
 * restoring, or the shown target deleted elsewhere — the most recently
 * touched one, which is the one the user was most likely just working on.
 */
export const chooseActiveTargetId = (currentId: string | null, targets: readonly Target[]): string | null => {
  if (currentId && targets.some((target) => target.id === currentId)) return currentId;
  let newest: Target | undefined;
  for (const target of targets) {
    if (!newest || timeOf(target.updatedAt) > timeOf(newest.updatedAt)) newest = target;
  }
  return newest?.id ?? null;
};

/**
 * The stamp for a record changing now. Never earlier than the stamp it
 * already has, so an edit made after seeing a record always beats that
 * record — even when this device's clock is behind the one that wrote it.
 */
export const monotonicStamp = (previous: string | undefined, now: number): string => {
  const floor = previous === undefined ? 0 : timeOf(previous) + 1;
  return new Date(Math.max(now, floor)).toISOString();
};

/** A stamp further ahead than this was written by a clock that was wrong. */
export const FUTURE_STAMP_TOLERANCE_MS = 60 * 60 * 1_000;

/**
 * Re-stamps anything dated more than an hour ahead of `now`. A clock that was
 * set wrong leaves future stamps behind; monotonic stamping would carry them
 * forward forever, and the server refuses anything 24 h ahead. Once the clock
 * is right again this brings the records back into range. While it is still
 * wrong, `now` is wrong too and nothing changes — the server keeps refusing,
 * which is the honest outcome. Returns the same object when nothing moved.
 */
export const clampFutureStamps = (data: LocalSyncData, now: number): LocalSyncData => {
  const limit = now + FUTURE_STAMP_TOLERANCE_MS;
  const nowIso = new Date(now).toISOString();
  let changed = false;
  const ahead = (iso: string | undefined): boolean => iso !== undefined && timeOf(iso) > limit;
  // createdAt too: the same wrong clock wrote it, and the server checks it.
  const clamp = <T extends Stamped & { deletedAt?: string; createdAt?: string }>(record: T): T => {
    if (!ahead(record.updatedAt) && !ahead(record.deletedAt) && !ahead(record.createdAt)) return record;
    changed = true;
    return {
      ...record,
      updatedAt: ahead(record.updatedAt) ? nowIso : record.updatedAt,
      ...(ahead(record.deletedAt) ? { deletedAt: nowIso } : {}),
      ...(ahead(record.createdAt) ? { createdAt: nowIso } : {}),
    };
  };
  const next: LocalSyncData = {
    targets: data.targets.map(clamp),
    cvEntries: data.cvEntries.map(clamp),
    tombstones: { targets: data.tombstones.targets.map(clamp), cvEntries: data.tombstones.cvEntries.map(clamp) },
  };
  return changed ? next : data;
};

/** Order-independent equality, for "does the server already have this?". */
export const recordsEqual = (a: SyncRecords, b: SyncRecords): boolean => {
  const byId = <T extends Stamped>(records: readonly T[]): T[] =>
    [...records].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return (
    canonicalJson(byId(a.targets)) === canonicalJson(byId(b.targets)) &&
    canonicalJson(byId(a.cvEntries)) === canonicalJson(byId(b.cvEntries))
  );
};
