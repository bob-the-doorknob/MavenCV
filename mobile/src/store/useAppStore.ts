import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import type { Level } from '../data/roles';
import type {
  CvEntry,
  CvEntryTombstone,
  OnboardingDraft,
  CvEntryStatus,
  MilestoneSort,
  RoadmapTask,
  SchedulePace,
  Target,
  TargetTombstone,
  TaskPriority,
  TaskStatus,
  TaskStep,
  Tombstones,
} from '../types';
import { buildSchedule, clampEstimatedWeeks } from '../utils/schedule';
import { bumpEpoch } from './accountEpoch';
import {
  canonicalJson,
  chooseActiveTargetId,
  clampFutureStamps,
  fromRecords,
  isTombstone as isTombstoneRecord,
  mergeSnapshots,
  monotonicStamp,
  recordsEqual,
  restoreDeviceLocalFields,
  stripForPush,
  stripIncoming,
  toRecords,
  type SyncRecords,
} from '../utils/syncMerge';
import { createId } from '../utils/id';
import { calculateReadiness } from '../utils/readiness';

/**
 * The persisted-data version. 2 = the sync release (updatedAt on targets and
 * CV entries, tombstones, sync bookkeeping). Bumping it is what makes a
 * pre-migration copy get written. Older builds cannot read a newer version.
 */
export const STORE_VERSION = 2;

/**
 * One step per version: MIGRATIONS[n] turns version n into n + 1. Steps only
 * restructure; filling defaults and validating stay in `migrate()` below,
 * which runs on every load through `merge`. To add 2 -> 3, add MIGRATIONS[2]
 * and bump STORE_VERSION.
 */
const MIGRATIONS: Readonly<Record<number, (state: unknown) => unknown>> = {
  // 1 -> 2: the new sync fields are all filled in by load-time normalisation.
  1: (state) => state,
};

/** zustand's `migrate`. Exported for tests. */
export const migrateStoredState = (state: unknown, fromVersion: number): unknown => {
  if (fromVersion > STORE_VERSION) {
    // Written by a newer build. Refuse rather than misread it; the load
    // fails and nothing is written, so the data stays as it was.
    throw new UnreadableSavedData(`Saved data is from a newer version of Maven (${fromVersion}).`);
  }
  let current = state;
  for (let version = fromVersion; version < STORE_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    if (!step) throw new UnreadableSavedData(`No migration from saved data version ${version}.`);
    current = step(current);
  }
  return current;
};

/** Where the app's data lives in AsyncStorage. */
export const STORAGE_KEY = 'trajectory-app-state';
/**
 * A copy of the raw saved data, written once, before a migration, when the
 * stored version is older than this build's. Keyed by the version it was
 * taken from, so a later migration can never overwrite an earlier copy.
 */
export const PRE_MIGRATION_KEY_PREFIX = `${STORAGE_KEY}-pre-migration-v`;
/** Where "Start fresh" puts unreadable data before clearing it. */
export const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
/**
 * Older builds wrote this on every read and write, so it only ever mirrored
 * the current data. Nothing reads it any more; wipes delete it.
 */
export const LEGACY_BACKUP_KEY = `${STORAGE_KEY}-pre-migration-backup`;

// Separate from persisted state: reporting a read or write failure must never write over it.
export const useStorageStatus = create<{
  ready: boolean;
  error: string | null;
  /** Why the load failed, so the screen can lead with the right action. Null when there is no failure. */
  loadFailure: LoadFailure | null;
  /** A retry is re-reading the saved data right now. */
  checking: boolean;
  /** A retry just finished and the data still could not be read. */
  retried: boolean;
  writeFailed: boolean;
}>(() => ({
  ready: false,
  error: null,
  loadFailure: null,
  checking: false,
  retried: false,
  writeFailed: false,
}));

/** The stored payload's version, or null when it cannot be read. */
const storedVersion = (raw: string): number | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const version = (parsed as { version?: unknown }).version;
    // A payload from before versioning counts as version 0: older than any build.
    return typeof version === 'number' ? version : 0;
  } catch {
    return null;
  }
};

/**
 * Exported for tests. Writes the pre-migration copy if — and only if — the
 * stored version is older than this build's and no copy for that version
 * exists yet. Never overwrites, so a failed migration cannot replace it.
 */
export const savePreMigrationCopy = async (raw: string, currentVersion: number = STORE_VERSION): Promise<void> => {
  const version = storedVersion(raw);
  if (version === null || version >= currentVersion) return;
  const key = `${PRE_MIGRATION_KEY_PREFIX}${version}`;
  if ((await AsyncStorage.getItem(key)) !== null) return;
  try {
    await AsyncStorage.setItem(key, raw);
  } catch {
    throw new PreMigrationCopyFailed();
  }
};

/** The safety copy could not be written, so the load stopped before migrating. Most likely a full disk. */
export class PreMigrationCopyFailed extends Error {
  public constructor() {
    super('Could not write the pre-migration copy');
    this.name = 'PreMigrationCopyFailed';
  }
}

/**
 * The saved data is there but this build cannot read it: the shape is wrong, or
 * it comes from a newer version. Reading it again changes nothing.
 */
export class UnreadableSavedData extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnreadableSavedData';
  }
}

/**
 * - 'permanent': invalid JSON, or a shape or version this build cannot read. Retry cannot help.
 * - 'storage_full': the safety copy could not be written. Retry helps once space is freed.
 * - 'transient': anything else, such as a storage read that failed. Retry may help.
 */
export type LoadFailure = 'permanent' | 'storage_full' | 'transient';

export const classifyLoadFailure = (error: unknown): LoadFailure => {
  if (error instanceof PreMigrationCopyFailed) return 'storage_full';
  // SyntaxError: the stored text is not JSON. Anything else unknown is treated
  // as transient — offering Retry first is harmless, because Retry never writes.
  if (error instanceof UnreadableSavedData || error instanceof SyntaxError) return 'permanent';
  return 'transient';
};

/**
 * The splash text for a failed load. It only claims what the code guarantees:
 * a failed load never writes to the saved data (tests prove the stored bytes
 * are unchanged), so "nothing has been changed or deleted" holds. It does NOT
 * promise a backup copy: one exists only when older-version data was readable
 * before the failure, never for invalid JSON. Exported for tests.
 */
export const loadErrorMessage = (error: unknown): string => {
  switch (classifyLoadFailure(error)) {
    case 'storage_full':
      return "Your data couldn't be updated because this phone's storage may be full. Nothing has been changed. Free up some space, then retry.";
    case 'permanent':
      return "Maven can't read the saved data on this phone. Nothing has been changed or deleted — it is still on this phone. Export a copy before starting fresh.";
    case 'transient':
      return "Maven couldn't read your saved data just now. Nothing has been changed or deleted. Try again.";
  }
};

/**
 * Exported for tests. One write per save — the data and its "needs pushing"
 * flag travel together. A failure is recorded for the UI instead of vanishing
 * as an unhandled rejection, and cleared by the next successful write.
 */
export const writeState = async (name: string, value: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(name, value);
    if (useStorageStatus.getState().writeFailed) useStorageStatus.setState({ writeFailed: false });
  } catch {
    useStorageStatus.setState({ writeFailed: true });
  }
};

/** At most this many tasks can be in focus at once. */
export const MAX_FOCUS_TASKS = 2;

const CHECK_IN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Bookkeeping for cloud sync, persisted in the same write as the data it
 * describes — so a force-quit can never leave a change on disk without the
 * flag that says it still needs pushing.
 */
export interface SyncMeta {
  /** True while this device holds changes the server may not have. */
  dirty: boolean;
  /** Bumped on every local change, so a push can tell if more arrived mid-flight. */
  revision: number;
  /** The server's version this device last agreed with. Opaque; compared by equality. */
  baseServerUpdatedAt: string | null;
  lastSyncedAt: string | null;
  /**
   * The account this device's data belongs to. Set when an account is linked
   * or restored; cleared with the data. Sync only runs when it matches the
   * linked account, so one account's data can never be pushed into another.
   */
  ownerUid: string | null;
}

export interface PersistedAppState {
  targets: Target[];
  activeTargetId: string | null;
  cvEntries: CvEntry[];
  /** Null unless the user is part-way through onboarding. */
  onboardingDraft: OnboardingDraft | null;
  /** Deletes waiting to reach (or already on) the server. See docs/sync-contract.md §7. */
  tombstones: Tombstones;
  sync: SyncMeta;
}

export const emptySyncMeta: SyncMeta = {
  dirty: false,
  revision: 0,
  baseServerUpdatedAt: null,
  lastSyncedAt: null,
  ownerUid: null,
};

const emptyState: PersistedAppState = {
  targets: [],
  activeTargetId: null,
  cvEntries: [],
  onboardingDraft: null,
  tombstones: { targets: [], cvEntries: [] },
  sync: emptySyncMeta,
};

type ShapeCheck = { ok: true } | { ok: false; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** `undefined` (the field is absent) or the given type — lenient for optional fields. */
const isOptional = (value: unknown, check: (value: unknown) => boolean): boolean =>
  value === undefined || check(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isTaskStep = (value: unknown): value is TaskStep =>
  isRecord(value) && isString(value.id) && isString(value.title) && isBoolean(value.done);

const isTaskStepArray = (value: unknown): value is TaskStep[] =>
  Array.isArray(value) && value.every(isTaskStep);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isMilestoneSort = (value: unknown): value is MilestoneSort =>
  value === 'roadmap' || value === 'priority' || value === 'dueDate';

const isSchedulePace = (value: unknown): value is SchedulePace =>
  value === 'comfortable' || value === 'ambitious';

const isTaskStatus = (value: unknown): value is TaskStatus =>
  value === 'not_started' || value === 'in_progress' || value === 'done';
const isTaskPriority = (value: unknown): value is TaskPriority => value === 1 || value === 2 || value === 3;
const isLevel = (value: unknown): value is Level => value === 'internship' || value === 'entry-level';
const isCvEntryStatus = (value: unknown): value is CvEntryStatus =>
  value === 'pending' || value === 'ready' || value === 'failed';

/**
 * Data as it may sit on disk: `steps`, `focusTaskIds` and `estimatedWeeks`
 * were added after the first release, so anything persisted before then is
 * missing them. Validation accepts that; normalization (below) fills it in.
 */
type PersistedRoadmapTask = Omit<RoadmapTask, 'steps' | 'estimatedWeeks'> & {
  steps?: TaskStep[];
  estimatedWeeks?: number;
};
type PersistedTarget = Omit<Target, 'roadmap' | 'focusTaskIds' | 'updatedAt'> & {
  roadmap: PersistedRoadmapTask[];
  focusTaskIds?: string[];
  /** Absent on anything saved before sync existed. */
  updatedAt?: string;
};
type PersistedCvEntry = Omit<CvEntry, 'updatedAt'> & { updatedAt?: string };

/**
 * Every check below only requires the fields the app actually reads
 * (RoadmapTask/Target/CvEntry's required fields). Unknown extra fields and
 * absent optional fields are both fine — only a missing or wrong-typed
 * required field fails validation.
 */
const isRoadmapTask = (value: unknown): value is PersistedRoadmapTask =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.title) &&
  isString(value.doneWhen) &&
  isTaskPriority(value.priority) &&
  isTaskStatus(value.status) &&
  isOptional(value.why, isString) &&
  isOptional(value.steps, isTaskStepArray) &&
  isOptional(value.estimatedWeeks, isNumber) &&
  isOptional(value.targetDate, isString) &&
  isOptional(value.createdByUser, isBoolean) &&
  isOptional(value.startedAt, isString) &&
  isOptional(value.completedAt, isString) &&
  isOptional(value.notes, isString) &&
  isOptional(value.notificationId, isString);

const isTarget = (value: unknown): value is PersistedTarget =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.roleId) &&
  isOptional(value.customTitle, isString) &&
  isLevel(value.level) &&
  isOptional(value.employer, isString) &&
  isString(value.experience) &&
  isString(value.createdAt) &&
  isOptional(value.focusTaskIds, isStringArray) &&
  isOptional(value.lastCheckInAt, isString) &&
  isOptional(value.targetDate, isString) &&
  isOptional(value.schedulePace, isSchedulePace) &&
  isOptional(value.readyCelebratedAt, isString) &&
  isOptional(value.milestoneSort, isMilestoneSort) &&
  isOptional(value.updatedAt, isString) &&
  Array.isArray(value.roadmap) &&
  value.roadmap.every(isRoadmapTask);

const isCvEntry = (value: unknown): value is PersistedCvEntry =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.targetId) &&
  isString(value.taskId) &&
  isCvEntryStatus(value.status) &&
  isString(value.text) &&
  isOptional(value.suggestions, isStringArray) &&
  isString(value.createdAt) &&
  isOptional(value.updatedAt, isString);

const isTargetTombstone = (value: unknown): value is TargetTombstone =>
  isRecord(value) && isString(value.id) && isString(value.updatedAt) && isString(value.deletedAt);

const isCvEntryTombstone = (value: unknown): value is CvEntryTombstone =>
  isRecord(value) && isTargetTombstone(value) && isString(value.targetId);

/**
 * Lenient on purpose: tombstones and sync bookkeeping are rebuildable, so a
 * malformed one is dropped rather than failing the whole load and locking
 * the user out of their roadmap.
 */
const normalizeTombstones = (value: unknown): Tombstones => {
  if (!isRecord(value)) return { targets: [], cvEntries: [] };
  return {
    targets: Array.isArray(value.targets) ? value.targets.filter(isTargetTombstone) : [],
    cvEntries: Array.isArray(value.cvEntries) ? value.cvEntries.filter(isCvEntryTombstone) : [],
  };
};

const normalizeSyncMeta = (value: unknown): SyncMeta => {
  if (!isRecord(value)) return emptySyncMeta;
  return {
    dirty: isBoolean(value.dirty) ? value.dirty : false,
    revision: isNumber(value.revision) ? value.revision : 0,
    baseServerUpdatedAt: isString(value.baseServerUpdatedAt) ? value.baseServerUpdatedAt : null,
    lastSyncedAt: isString(value.lastSyncedAt) ? value.lastSyncedAt : null,
    ownerUid: isString(value.ownerUid) ? value.ownerUid : null,
  };
};

interface PersistedShape {
  targets: PersistedTarget[];
  activeTargetId: string | null;
  cvEntries: PersistedCvEntry[];
  onboardingDraft?: OnboardingDraft | null;
  tombstones?: unknown;
  sync?: unknown;
}

/** Fills the fields added after the first release, leaving everything else untouched. */
const normalizeTask = (task: PersistedRoadmapTask): RoadmapTask => ({
  ...task,
  weight: typeof task.weight === 'number' && Number.isFinite(task.weight) && task.weight > 0 ? task.weight : task.priority,
  steps: task.steps ?? [],
  estimatedWeeks: clampEstimatedWeeks(task.estimatedWeeks),
});

const normalizeTarget = (target: PersistedTarget): Target => ({
  ...target,
  roadmap: target.roadmap.map(normalizeTask),
  focusTaskIds: target.focusTaskIds ?? [],
  // Pre-sync data: the last moment we can vouch for is when it was created.
  updatedAt: target.updatedAt ?? target.createdAt,
});

const normalizeCvEntry = (entry: PersistedCvEntry): CvEntry => ({
  ...entry,
  updatedAt: entry.updatedAt ?? entry.createdAt,
});

const checkPersistedAppState = (value: unknown): ShapeCheck => {
  if (!isRecord(value)) {
    return { ok: false, reason: 'persisted state is not an object' };
  }
  if (!Array.isArray(value.targets) || !value.targets.every(isTarget)) {
    return { ok: false, reason: "'targets' is missing, not an array, or contains an invalid target" };
  }
  if (!(value.activeTargetId === null || isString(value.activeTargetId))) {
    return { ok: false, reason: "'activeTargetId' must be a string or null" };
  }
  if (!Array.isArray(value.cvEntries) || !value.cvEntries.every(isCvEntry)) {
    return { ok: false, reason: "'cvEntries' is missing, not an array, or contains an invalid entry" };
  }
  return { ok: true };
};

/**
 * Resets to empty state only when a required field is missing or wrong-typed
 * — an unrelated or pre-redesign shape. Unknown extra fields and absent
 * optional fields pass through untouched.
 *
 * `undefined`/`null` (nothing persisted yet, e.g. a fresh install) resets
 * silently — that's not broken data, just none. Anything else that fails
 * validation warns, since it means something real was read and didn't match.
 */
export const migrate = (persistedState: unknown): PersistedAppState => {
  if (persistedState === undefined || persistedState === null) {
    return emptyState;
  }
  if (isRecord(persistedState) && Array.isArray(persistedState.targetRoles)) {
    persistedState = {
      targets: persistedState.targetRoles.map((target: unknown) => {
        if (!isRecord(target) || !Array.isArray(target.tasks)) return target;
        return { ...target, roleId: 'custom', customTitle: target.title, level: 'entry-level', experience: '', focusTaskIds: [],
          roadmap: target.tasks.map((task: unknown) => isRecord(task) ? { ...task, doneWhen: '', priority: 2, steps: [], estimatedWeeks: 2 } : task) };
      }),
      activeTargetId: persistedState.activeTargetRoleId ?? null,
      cvEntries: Array.isArray(persistedState.cvEntries) ? persistedState.cvEntries.map((entry: unknown) => isRecord(entry)
        ? { ...entry, targetId: entry.targetRoleId, taskId: entry.sourceTaskId, status: 'ready' } : entry) : [],
    };
  }
  const check = checkPersistedAppState(persistedState);
  if (!check.ok) {
    console.warn(`Maven: preserving unreadable persisted app state — ${check.reason}.`);
    throw new UnreadableSavedData('Saved data could not be loaded. It has not been deleted.');
  }
  const persisted = persistedState as PersistedShape;
  const targets = persisted.targets.map(normalizeTarget);
  return {
    ...persisted,
    targets,
    cvEntries: persisted.cvEntries.map(normalizeCvEntry),
    // A draft written before this field existed is simply absent.
    onboardingDraft: persisted.onboardingDraft ?? null,
    tombstones: normalizeTombstones(persisted.tombstones),
    sync: normalizeSyncMeta(persisted.sync),
    activeTargetId: targets.some((target) => target.id === persisted.activeTargetId)
      ? persisted.activeTargetId
      : targets[0]?.id ?? null,
  };
};

/**
 * Validates and normalizes records arriving from the server with the same
 * rules used for data loaded from disk. Returns null if anything is
 * malformed: sync then reports an error and touches nothing local.
 */
export const parseIncomingRecords = (targets: unknown[], cvEntries: unknown[]): SyncRecords | null => {
  const parsedTargets: SyncRecords['targets'] = [];
  for (const value of targets) {
    if (isTargetTombstone(value)) parsedTargets.push({ id: value.id, updatedAt: value.updatedAt, deletedAt: value.deletedAt });
    else if (isTarget(value)) parsedTargets.push(normalizeTarget(value));
    else return null;
  }
  const parsedEntries: SyncRecords['cvEntries'] = [];
  for (const value of cvEntries) {
    if (isCvEntryTombstone(value)) {
      parsedEntries.push({ id: value.id, targetId: value.targetId, updatedAt: value.updatedAt, deletedAt: value.deletedAt });
    } else if (isCvEntry(value)) parsedEntries.push(normalizeCvEntry(value));
    else return null;
  }
  return { targets: parsedTargets, cvEntries: parsedEntries };
};

export type AddTargetInput = Omit<
  Target,
  'id' | 'createdAt' | 'updatedAt' | 'roadmap' | 'focusTaskIds' | 'lastCheckInAt'
> & {
  roadmap?: RoadmapTask[];
};

export type AddCvEntryInput = Omit<CvEntry, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Enough to put back exactly what a delete removed, including where it sat.
 * Transient: an undo that outlives the banner is worse than no undo.
 */
export type PendingUndo =
  | {
      kind: 'task';
      message: string;
      targetId: string;
      index: number;
      task: RoadmapTask;
      focusTaskIds: string[];
      cvEntries: CvEntry[];
    }
  | { kind: 'cvEntry'; message: string; index: number; entry: CvEntry };

export interface TargetProfileUpdate {
  level?: Level;
  employer?: string;
  experience?: string;
}

export interface AddMilestoneInput {
  title: string;
  doneWhen: string;
  priority: TaskPriority;
  estimatedWeeks: number;
}

interface AppState extends PersistedAppState {
  addTarget: (input: AddTargetInput) => string;
  setActiveTarget: (targetId: string | null) => void;
  removeTarget: (targetId: string) => void;
  /** Edits the stored profile only — the roadmap is left exactly as it is. */
  updateTargetProfile: (targetId: string, updates: TargetProfileUpdate) => void;
  /**
   * Swaps the active target's unfinished milestones for freshly generated
   * ones. Finished work and the CV bullets it earned are kept.
   */
  replaceUnfinishedRoadmap: (tasks: RoadmapTask[]) => void;
  startTask: (taskId: string) => void;
  /** Completes locally and creates one pending CV entry, without network calls. */
  completeTask: (taskId: string, notes: string) => void;
  editTask: (
    taskId: string,
    updates: Partial<Pick<RoadmapTask, 'title' | 'doneWhen' | 'priority' | 'notes'>>,
  ) => void;
  deleteTask: (taskId: string) => void;
  /** How the milestone list is ordered on screen, for the active target. */
  setMilestoneSort: (sort: MilestoneSort) => void;
  /** Deletes a CV bullet outright, keeping it recoverable until the undo expires. */
  deleteCvEntry: (id: string) => void;
  /** Puts back whatever the last delete removed. No-op once it has expired. */
  undoDelete: () => void;
  clearPendingUndo: () => void;
  pendingUndo: PendingUndo | null;
  /** Moves a step within its task. Out-of-range moves are ignored. */
  moveStep: (taskId: string, stepId: string, offset: -1 | 1) => void;
  /** Ticks every step on a task at once. */
  completeAllSteps: (taskId: string) => void;
  /** Remembers where onboarding got to, so quitting does not lose the answers. */
  saveOnboardingDraft: (draft: OnboardingDraft) => void;
  clearOnboardingDraft: () => void;
  /** Appends a user-created milestone to the active target's roadmap. */
  addMilestone: (input: AddMilestoneInput) => string;
  /** Reorders the active roadmap. Unknown ids are ignored; omitted tasks keep their order at the end. */
  reorderTasks: (taskIds: string[]) => void;
  setTargetDate: (date: string) => void;
  clearTargetDate: () => void;
  setSchedulePace: (pace: SchedulePace) => void;
  setEstimatedWeeks: (taskId: string, weeks: number) => void;
  /** Sets the pace and lays every remaining milestone out against the target date. */
  applySchedule: (pace: SchedulePace) => void;
  toggleStep: (taskId: string, stepId: string) => void;
  addStep: (taskId: string, title: string) => void;
  removeStep: (taskId: string, stepId: string) => void;
  /** Keeps at most MAX_FOCUS_TASKS ids, dropping unknown and already-done tasks. */
  setFocusTasks: (taskIds: string[]) => void;
  recordCheckIn: () => void;
  /** Stamps the active target so the 100% celebration only ever fires once. */
  markReadyCelebrated: () => void;
  /**
   * A short confirmation to show on the roadmap, set by a screen that is
   * about to pop. Transient: never persisted, cleared once shown.
   */
  completionNotice: string | null;
  /** Which task the notice is about, so its node can replay its pop. */
  completedTaskId: string | null;
  /** `taskId` is optional: some notices are not about one milestone. */
  showCompletionNotice: (message: string, taskId?: string) => void;
  clearCompletionNotice: () => void;
  addCvEntry: (entry: AddCvEntryInput) => string;
  updateCvEntry: (id: string, updates: Partial<Pick<CvEntry, 'status' | 'text' | 'suggestions'>>) => void;
  resetAll: () => void;
  /**
   * Merges a server snapshot into whatever is local *right now* — not into a
   * copy read before the request, which would drop an edit made while it was
   * in flight. Returns true when the result differs from what the server
   * holds, i.e. a push is still needed.
   */
  mergeRemote: (remote: SyncRecords, serverUpdatedAt: string | null) => boolean;
  /** Bookkeeping only; never marks the data itself as changed. */
  setSyncMeta: (meta: Partial<SyncMeta>) => void;
  /** See clampFutureStamps. Marks dirty when anything was re-stamped. */
  repairFutureStamps: (now: number) => void;
  /**
   * The user chose this device's data over an account's existing copy.
   * Tombstones every live cloud record the device does not have, so the next
   * sync replaces the account copy instead of merging into it. Called only
   * after the user has confirmed.
   */
  replaceAccountCopy: (cloud: SyncRecords, serverUpdatedAt: string | null) => void;
}

type AppSet = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;

const withoutStamp = <T extends { updatedAt: string }>(record: T): string =>
  canonicalJson({ ...record, updatedAt: '' });

/**
 * The one place sync bookkeeping happens. Every store action goes through
 * it, so a future action cannot forget to stamp or to record a delete:
 *
 * - a target or CV entry that really changed gets a fresh monotonic
 *   `updatedAt` (a new object with identical content keeps its old stamp);
 * - one that disappeared leaves a tombstone, and one that comes back (undo)
 *   takes its tombstone away again;
 * - anything at all changing marks the data dirty and bumps the revision.
 *
 * Exported for tests. `now` is injected so stamps are deterministic there.
 */
export const stampChanges = (
  current: PersistedAppState,
  patch: Partial<PersistedAppState>,
  now: number,
): Partial<PersistedAppState> => {
  let changed = false;
  let tombstones = current.tombstones;
  const out: Partial<PersistedAppState> = { ...patch };

  if (patch.targets && patch.targets !== current.targets) {
    const previous = new Map(current.targets.map((target) => [target.id, target]));
    const next = patch.targets.map((incoming) => {
      const before = previous.get(incoming.id);
      if (before === incoming) return incoming;
      // Normalised here, so what an action leaves in memory is exactly what a
      // reload from disk would produce (see the invariant test).
      const target = normalizeTarget(incoming);
      if (before && withoutStamp(before) === withoutStamp(target)) return before;
      changed = true;
      return { ...target, updatedAt: monotonicStamp(before?.updatedAt, now) };
    });
    const nextIds = new Set(next.map((target) => target.id));
    const removed: TargetTombstone[] = current.targets
      .filter((target) => !nextIds.has(target.id))
      .map((target) => {
        const stamp = monotonicStamp(target.updatedAt, now);
        return { id: target.id, updatedAt: stamp, deletedAt: stamp };
      });
    if (removed.length > 0) changed = true;
    tombstones = {
      ...tombstones,
      targets: [
        ...tombstones.targets.filter((tomb) => !nextIds.has(tomb.id) && !removed.some((r) => r.id === tomb.id)),
        ...removed,
      ],
    };
    out.targets = next;
  }

  if (patch.cvEntries && patch.cvEntries !== current.cvEntries) {
    const previous = new Map(current.cvEntries.map((entry) => [entry.id, entry]));
    const next = patch.cvEntries.map((incoming) => {
      const before = previous.get(incoming.id);
      if (before === incoming) return incoming;
      const entry = normalizeCvEntry(incoming);
      if (before && withoutStamp(before) === withoutStamp(entry)) return before;
      changed = true;
      return { ...entry, updatedAt: monotonicStamp(before?.updatedAt, now) };
    });
    const nextIds = new Set(next.map((entry) => entry.id));
    const removed: CvEntryTombstone[] = current.cvEntries
      .filter((entry) => !nextIds.has(entry.id))
      .map((entry) => {
        const stamp = monotonicStamp(entry.updatedAt, now);
        return { id: entry.id, targetId: entry.targetId, updatedAt: stamp, deletedAt: stamp };
      });
    if (removed.length > 0) changed = true;
    tombstones = {
      ...tombstones,
      cvEntries: [
        ...tombstones.cvEntries.filter((tomb) => !nextIds.has(tomb.id) && !removed.some((r) => r.id === tomb.id)),
        ...removed,
      ],
    };
    out.cvEntries = next;
  }

  if (!changed) return out;
  return {
    ...out,
    tombstones,
    sync: { ...current.sync, dirty: true, revision: current.sync.revision + 1 },
  };
};

/** Applies `map` to the active target only; other targets pass through unchanged. */
const mapActiveTarget = (
  targets: Target[],
  activeTargetId: string | null,
  map: (target: Target) => Target,
): Target[] => targets.map((target) => (target.id === activeTargetId ? map(target) : target));

/** Applies `map` to the active target's roadmap only; other targets pass through unchanged. */
const mapActiveRoadmap = (
  targets: Target[],
  activeTargetId: string | null,
  map: (tasks: RoadmapTask[]) => RoadmapTask[],
): Target[] =>
  mapActiveTarget(targets, activeTargetId, (target) => ({ ...target, roadmap: map(target.roadmap) }));

/**
 * Re-lays the remaining milestones whenever the roadmap changes under a
 * target date — finishing, deleting or re-estimating a task all move every
 * date after it. Without a target date there is nothing to lay out.
 */
const withSchedule = (target: Target, now: number): Target => {
  if (!target.targetDate) {
    return target;
  }
  return {
    ...target,
    roadmap: buildSchedule(target.roadmap, target.targetDate, now, target.schedulePace ?? 'comfortable'),
  };
};

/** Steps live on a task, so every step action is the same shape of update. */
const mapTaskSteps = (
  targets: Target[],
  activeTargetId: string | null,
  taskId: string,
  map: (steps: TaskStep[]) => TaskStep[],
): Target[] =>
  mapActiveRoadmap(targets, activeTargetId, (tasks) =>
    tasks.map((task) => (task.id === taskId ? { ...task, steps: map(task.steps) } : task)),
  );

export const useAppStore = create<AppState>()(
  persist(
    (rawSet, get) => {
      // Every action below writes through this; only sync and resetAll use rawSet.
      const set: AppSet = (partial) => {
        const current = get();
        const patch = typeof partial === 'function' ? partial(current) : partial;
        rawSet(stampChanges(current, patch, Date.now()) as Partial<AppState>);
      };

      return {
      ...emptyState,

      addTarget: (input) => {
        const id = createId();
        const createdAt = new Date().toISOString();
        const target: Target = {
          focusTaskIds: [],
          ...input,
          id,
          createdAt,
          updatedAt: createdAt,
          roadmap: input.roadmap ?? [],
        };
        // The onboarding draft is cleared in the same write: a kill between
        // two writes must not leave a used draft to pre-fill the next flow.
        set((state) => ({ targets: [...state.targets, target], activeTargetId: id, onboardingDraft: null }));
        return id;
      },

      setActiveTarget: (targetId) => set({ activeTargetId: targetId }),

      removeTarget: (targetId) =>
        set((state) => {
          const targets = state.targets.filter((target) => target.id !== targetId);
          const activeTargetId =
            state.activeTargetId === targetId ? (targets[0]?.id ?? null) : state.activeTargetId;
          // The user explicitly removed this target: ALL of its CV entries go
          // with it, including 'ready' ones. deleteTask (below) is gentler —
          // it only drops entries that were never earned.
          const cvEntries = state.cvEntries.filter((entry) => entry.targetId !== targetId);
          return { targets, activeTargetId, cvEntries };
        }),

      updateTargetProfile: (targetId, updates) =>
        set((state) => ({
          targets: state.targets.map((target) => {
            if (target.id !== targetId) {
              return target;
            }
            // Rebuilt without `employer`, so clearing it removes the key
            // rather than storing an empty string.
            const { employer: previousEmployer, ...rest } = target;
            const employer =
              updates.employer === undefined ? previousEmployer : updates.employer.trim();

            return {
              ...rest,
              ...(employer ? { employer } : {}),
              ...(updates.level ? { level: updates.level } : {}),
              ...(updates.experience === undefined
                ? {}
                : { experience: updates.experience.trim() }),
            };
          }),
        })),

      replaceUnfinishedRoadmap: (tasks) =>
        set((state) => {
          const active = state.targets.find((target) => target.id === state.activeTargetId);
          if (!active) {
            return {};
          }

          const kept = active.roadmap.filter((task) => task.status === 'done');
          const keptIds = new Set(kept.map((task) => task.id));
          const dropped = active.roadmap.filter((task) => !keptIds.has(task.id));
          const droppedIds = new Set(dropped.map((task) => task.id));

          return {
            targets: state.targets.map((target) =>
              target.id === active.id
                ? withSchedule(
                    {
                      ...target,
                      roadmap: [...kept, ...tasks],
                      // Focus can only point at work that still exists.
                      focusTaskIds: target.focusTaskIds.filter((id) => keptIds.has(id)),
                    },
                    Date.now(),
                  )
                : target,
            ),
            // Same rule as deleteTask: a bullet that was never earned goes
            // with the milestone, an earned one survives.
            cvEntries: state.cvEntries.filter(
              (entry) => !droppedIds.has(entry.taskId) || entry.status === 'ready',
            ),
          };
        }),

      startTask: (taskId) =>
        set((state) => ({
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) =>
            tasks.map((task) =>
              task.id === taskId && task.status !== 'done'
                ? { ...task, status: 'in_progress', startedAt: task.startedAt ?? new Date().toISOString() }
                : task,
            ),
          ),
        })),

      completeTask: (taskId, notes) => {
        const { targets, activeTargetId } = get();
        const activeTarget = targets.find((target) => target.id === activeTargetId);
        if (!activeTarget?.roadmap.some((task) => task.id === taskId && task.status !== 'done')) {
          return;
        }

        const completedAt = new Date().toISOString();
        const cvEntry: CvEntry = {
          id: createId(),
          targetId: activeTarget.id,
          taskId,
          status: 'pending',
          text: '',
          createdAt: completedAt,
          updatedAt: completedAt,
        };

        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) =>
            withSchedule(
              {
                ...target,
                roadmap: target.roadmap.map((task) =>
                  task.id === taskId ? { ...task, status: 'done', completedAt, notes } : task,
                ),
                // Focus is for what's still open — a finished task drops out of it.
                focusTaskIds: target.focusTaskIds.filter((id) => id !== taskId),
              },
              Date.now(),
            ),
          ),
          cvEntries: [...state.cvEntries, cvEntry],
        }));
      },

      editTask: (taskId, updates) =>
        set((state) => ({
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) =>
            tasks.map((task) => (task.id === taskId ? { ...task, weight: task.weight ?? task.priority, ...updates } : task)),
          ),
        })),

      deleteTask: (taskId) =>
        set((state) => {
          const active = state.targets.find((target) => target.id === state.activeTargetId);
          const index = active?.roadmap.findIndex((task) => task.id === taskId) ?? -1;
          const task = index >= 0 ? active?.roadmap[index] : undefined;
          // Everything this delete is about to discard, kept for undo.
          const removedEntries = state.cvEntries.filter(
            (entry) => entry.taskId === taskId && entry.status !== 'ready',
          );

          return {
          pendingUndo:
            active && task
              ? {
                  kind: 'task' as const,
                  message: 'Milestone deleted',
                  targetId: active.id,
                  index,
                  task,
                  focusTaskIds: active.focusTaskIds,
                  cvEntries: removedEntries,
                }
              : state.pendingUndo,
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) =>
            withSchedule(
              {
                ...target,
                roadmap: target.roadmap.filter((entry) => entry.id !== taskId),
                focusTaskIds: target.focusTaskIds.filter((id) => id !== taskId),
              },
              Date.now(),
            ),
          ),
          // Drop not-yet-earned entries for this task (pending/failed); a
          // 'ready' entry is an earned CV line and survives.
          cvEntries: state.cvEntries.filter((entry) => entry.taskId !== taskId || entry.status === 'ready'),
          };
        }),

      addMilestone: (input) => {
        const id = createId();
        const milestone: RoadmapTask = {
          id,
          title: input.title.trim(),
          doneWhen: input.doneWhen.trim(),
          priority: input.priority,
          weight: (() => {
            const tasks = get().targets.find((target) => target.id === get().activeTargetId)?.roadmap ?? [];
            return tasks.length ? tasks.reduce((sum, task) => sum + (task.weight ?? task.priority), 0) / tasks.length : 1;
          })(),
          estimatedWeeks: clampEstimatedWeeks(input.estimatedWeeks),
          steps: [],
          status: 'not_started',
          createdByUser: true,
        };
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) =>
            withSchedule({ ...target, roadmap: [...target.roadmap, milestone] }, Date.now()),
          ),
        }));
        return id;
      },

      // Order drives the schedule, so a reorder re-dates everything after it.
      reorderTasks: (taskIds) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => {
            const ordered = Array.from(new Set(taskIds))
              .map((id) => target.roadmap.find((task) => task.id === id))
              .filter((task): task is RoadmapTask => task !== undefined);
            const rest = target.roadmap.filter((task) => !taskIds.includes(task.id));
            return withSchedule({ ...target, roadmap: [...ordered, ...rest] }, Date.now());
          }),
        })),

      setTargetDate: (date) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            targetDate: date,
          })),
        })),

      clearTargetDate: () =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => {
            const { targetDate: _removed, ...rest } = target;
            return { ...rest, roadmap: rest.roadmap.map(({ targetDate: _date, ...task }) => task) };
          }),
        })),

      setSchedulePace: (pace) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            schedulePace: pace,
          })),
        })),

      setEstimatedWeeks: (taskId, weeks) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) =>
            withSchedule(
              {
                ...target,
                roadmap: target.roadmap.map((task) =>
                  task.id === taskId ? { ...task, estimatedWeeks: clampEstimatedWeeks(weeks) } : task,
                ),
              },
              Date.now(),
            ),
          ),
        })),

      applySchedule: (pace) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) =>
            withSchedule({ ...target, schedulePace: pace }, Date.now()),
          ),
        })),

      toggleStep: (taskId, stepId) =>
        set((state) => ({
          targets: mapTaskSteps(state.targets, state.activeTargetId, taskId, (steps) =>
            steps.map((step) => {
              if (step.id !== stepId) {
                return step;
              }
              // Un-ticking drops the stamp, so the streak only ever counts
              // work that is actually finished.
              const { completedAt: _cleared, ...rest } = step;
              return step.done
                ? { ...rest, done: false }
                : { ...rest, done: true, completedAt: new Date().toISOString() };
            }),
          ),
        })),

      addStep: (taskId, title) => {
        const trimmed = title.trim();
        if (!trimmed) {
          return;
        }
        set((state) => ({
          targets: mapTaskSteps(state.targets, state.activeTargetId, taskId, (steps) => [
            ...steps,
            { id: createId(), title: trimmed, done: false },
          ]),
        }));
      },

      removeStep: (taskId, stepId) =>
        set((state) => ({
          targets: mapTaskSteps(state.targets, state.activeTargetId, taskId, (steps) =>
            steps.filter((step) => step.id !== stepId),
          ),
        })),

      setFocusTasks: (taskIds) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => {
            const selectable = new Set(
              target.roadmap.filter((task) => task.status !== 'done').map((task) => task.id),
            );
            const focusTaskIds = Array.from(new Set(taskIds))
              .filter((id) => selectable.has(id))
              .slice(0, MAX_FOCUS_TASKS);
            return { ...target, focusTaskIds };
          }),
        })),

      recordCheckIn: () =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            lastCheckInAt: new Date().toISOString(),
          })),
        })),

      completionNotice: null,

      completedTaskId: null,

      showCompletionNotice: (message, taskId) =>
        set({ completionNotice: message, completedTaskId: taskId ?? null }),

      clearCompletionNotice: () => set({ completionNotice: null, completedTaskId: null }),

      markReadyCelebrated: () =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) =>
            target.readyCelebratedAt
              ? target
              : { ...target, readyCelebratedAt: new Date().toISOString() },
          ),
        })),

      saveOnboardingDraft: (draft) => set({ onboardingDraft: draft }),

      clearOnboardingDraft: () => set({ onboardingDraft: null }),

      pendingUndo: null,

      clearPendingUndo: () => set({ pendingUndo: null }),

      setMilestoneSort: (sort) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            milestoneSort: sort,
          })),
        })),

      deleteCvEntry: (id) =>
        set((state) => {
          const index = state.cvEntries.findIndex((entry) => entry.id === id);
          const entry = index >= 0 ? state.cvEntries[index] : undefined;
          if (!entry) {
            return {};
          }
          return {
            cvEntries: state.cvEntries.filter((candidate) => candidate.id !== id),
            pendingUndo: { kind: 'cvEntry', message: 'CV bullet deleted', index, entry },
          };
        }),

      undoDelete: () =>
        set((state) => {
          const undo = state.pendingUndo;
          if (!undo) {
            return {};
          }

          if (undo.kind === 'cvEntry') {
            const cvEntries = [...state.cvEntries];
            cvEntries.splice(Math.min(undo.index, cvEntries.length), 0, undo.entry);
            return { cvEntries, pendingUndo: null };
          }

          return {
            targets: state.targets.map((target) => {
              if (target.id !== undo.targetId) {
                return target;
              }
              const roadmap = [...target.roadmap];
              roadmap.splice(Math.min(undo.index, roadmap.length), 0, undo.task);
              return withSchedule(
                { ...target, roadmap, focusTaskIds: undo.focusTaskIds },
                Date.now(),
              );
            }),
            cvEntries: [...state.cvEntries, ...undo.cvEntries],
            pendingUndo: null,
          };
        }),

      moveStep: (taskId, stepId, offset) =>
        set((state) => ({
          targets: mapTaskSteps(state.targets, state.activeTargetId, taskId, (steps) => {
            const index = steps.findIndex((step) => step.id === stepId);
            const next = index + offset;
            if (index < 0 || next < 0 || next >= steps.length) {
              return steps;
            }
            const reordered = [...steps];
            const [moved] = reordered.splice(index, 1);
            reordered.splice(next, 0, moved as TaskStep);
            return reordered;
          }),
        })),

      completeAllSteps: (taskId) =>
        set((state) => ({
          targets: mapTaskSteps(state.targets, state.activeTargetId, taskId, (steps) =>
            steps.map((step) =>
              step.done ? step : { ...step, done: true, completedAt: new Date().toISOString() },
            ),
          ),
        })),

      addCvEntry: (entry) => {
        const id = createId();
        const createdAt = new Date().toISOString();
        const cvEntry: CvEntry = { ...entry, id, createdAt, updatedAt: createdAt };
        set((state) => ({ cvEntries: [...state.cvEntries, cvEntry] }));
        return id;
      },

      updateCvEntry: (id, updates) =>
        set((state) => {
          if (state.cvEntries.some((entry) => entry.id === id)) {
            return {
              cvEntries: state.cvEntries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)),
            };
          }
          // Deleted while its bullet was generating, but still undoable. The
          // result is kept on the held copy, so an undo restores it finished
          // instead of pending — and the queue does not pay for it twice.
          const undo = state.pendingUndo;
          if (undo?.kind === 'cvEntry' && undo.entry.id === id) {
            return { pendingUndo: { ...undo, entry: { ...undo.entry, ...updates } } };
          }
          if (undo?.kind === 'task' && undo.cvEntries.some((entry) => entry.id === id)) {
            return {
              pendingUndo: {
                ...undo,
                cvEntries: undo.cvEntries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)),
              },
            };
          }
          return {};
        }),

      // A local wipe, as Settings describes it ("from this device"): no
      // tombstones, so the account's copy is untouched and a later sync
      // restores it, exactly like a fresh install.
      resetAll: () => {
        // Anything still in flight was for the data being wiped.
        bumpEpoch();
        rawSet({ ...emptyState, pendingUndo: null });
      },

      mergeRemote: (remote, serverUpdatedAt) => {
        const incoming = stripIncoming(remote);
        let needsPush = false;
        rawSet((state) => {
          // Incoming records are normalized (parseIncomingRecords fills
          // defaults such as a task's `weight`); records built in memory by
          // actions may not be yet — reloading from disk would normalize them.
          // Merging the two shapes made an identical, identically stamped
          // record look different: the tie-break kept the local shape, the
          // result never matched the server, and every pull pushed again.
          // Normalizing local first makes "same data" compare as same.
          const local = toRecords({
            ...state,
            targets: state.targets.map(normalizeTarget),
            cvEntries: state.cvEntries.map(normalizeCvEntry),
          });
          const merged = fromRecords(mergeSnapshots(local, incoming, Date.now()));
          const targets = restoreDeviceLocalFields(state.targets, merged.targets);
          needsPush = !recordsEqual(stripForPush(toRecords(merged)), stripForPush(incoming));
          return {
            targets,
            cvEntries: merged.cvEntries,
            tombstones: merged.tombstones,
            activeTargetId: chooseActiveTargetId(state.activeTargetId, targets),
            sync: {
              ...state.sync,
              baseServerUpdatedAt: serverUpdatedAt,
              // Still dirty if this device holds anything the server lacks.
              dirty: needsPush,
            },
          };
        });
        return needsPush;
      },

      setSyncMeta: (meta) => rawSet((state) => ({ sync: { ...state.sync, ...meta } })),

      replaceAccountCopy: (cloud, serverUpdatedAt) =>
        rawSet((state) => {
          const now = Date.now();
          const localTargets = new Set(state.targets.map((target) => target.id));
          const localEntries = new Set(state.cvEntries.map((entry) => entry.id));
          const targetTombs: TargetTombstone[] = cloud.targets
            .filter((record) => !isTombstoneRecord(record) && !localTargets.has(record.id))
            .map((record) => {
              const stamp = monotonicStamp(record.updatedAt, now);
              return { id: record.id, updatedAt: stamp, deletedAt: stamp };
            });
          const entryTombs: CvEntryTombstone[] = cloud.cvEntries
            .filter((record) => !isTombstoneRecord(record) && !localEntries.has(record.id))
            .map((record) => {
              const stamp = monotonicStamp(record.updatedAt, now);
              return { id: record.id, targetId: record.targetId, updatedAt: stamp, deletedAt: stamp };
            });
          return {
            tombstones: {
              targets: [...state.tombstones.targets, ...targetTombs],
              cvEntries: [...state.tombstones.cvEntries, ...entryTombs],
            },
            sync: { ...state.sync, baseServerUpdatedAt: serverUpdatedAt, dirty: true, revision: state.sync.revision + 1 },
          };
        }),

      repairFutureStamps: (now) =>
        rawSet((state) => {
          const repaired = clampFutureStamps(state, now);
          if (repaired === state) return {};
          return {
            ...repaired,
            sync: { ...state.sync, dirty: true, revision: state.sync.revision + 1 },
          };
        }),
      };
    },
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      migrate: migrateStoredState,
      storage: createJSONStorage(() => ({
        ...AsyncStorage,
        setItem: writeState,
        getItem: async (name: string) => {
          const saved = await AsyncStorage.getItem(name);
          // Before migrate runs, and only for an older version. If the copy
          // cannot be written the load fails on purpose: migrating would write
          // the new shape back over the only copy of the old data.
          if (saved !== null) await savePreMigrationCopy(saved);
          return saved;
        },
      })),
      onRehydrateStorage: () => {
        // An earlier failure stays on screen while a retry reads again, so the
        // screen does not flip to "Loading" and lose its buttons mid-retry.
        useStorageStatus.setState({ ready: false, writeFailed: false });
        return (_state, error) =>
          useStorageStatus.setState({
            ready: !error,
            error: error ? loadErrorMessage(error) : null,
            loadFailure: error ? classifyLoadFailure(error) : null,
          });
      },
      // Runs on every rehydration (not just version bumps), so a same-version
      // but corrupted or pre-redesign payload still resets safely.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrate(persistedState),
      }),
      partialize: ({ targets, activeTargetId, cvEntries, onboardingDraft, tombstones, sync }) => ({
        targets,
        activeTargetId,
        cvEntries,
        onboardingDraft,
        tombstones,
        sync,
      }),
    },
  ),
);

const activeTargetOf = (state: PersistedAppState): Target | null =>
  state.targets.find((target) => target.id === state.activeTargetId) ?? null;

export const useActiveTarget = (): Target | null => useAppStore(activeTargetOf);

const EMPTY_ROADMAP: RoadmapTask[] = [];
export const useActiveRoadmap = (): RoadmapTask[] =>
  useAppStore((state) => state.targets.find((target) => target.id === state.activeTargetId)?.roadmap ?? EMPTY_ROADMAP);

export const useReadiness = (): number => calculateReadiness(useActiveRoadmap());

/** The active target's focus tasks, in the order they were chosen. */
export const selectFocusTasks = (state: PersistedAppState): RoadmapTask[] => {
  const target = activeTargetOf(state);
  if (!target) {
    return [];
  }
  return target.focusTaskIds.flatMap((id) => {
    const task = target.roadmap.find((candidate) => candidate.id === id);
    return task ? [task] : [];
  });
};

export const useFocusTasks = (): RoadmapTask[] => useAppStore(useShallow(selectFocusTasks));

/**
 * A check-in is due a week after the last one — or a week after the target
 * was created, if there has never been one. Targets with nothing in focus
 * have nothing to check in on.
 *
 * The check-in sheet this drives (not built yet) asks "Still working on
 * these?" — milestones run for weeks, so a check-in is a nudge to confirm or
 * swap what you picked, not a weekly deadline.
 */
export const isCheckInDue = (target: Target | null, now: number): boolean => {
  if (!target || target.focusTaskIds.length === 0) {
    return false;
  }
  const since = Date.parse(target.lastCheckInAt ?? target.createdAt);
  if (Number.isNaN(since)) {
    return false;
  }
  return now - since >= CHECK_IN_INTERVAL_MS;
};

export const selectIsCheckInDue = (state: PersistedAppState, now: number = Date.now()): boolean =>
  isCheckInDue(activeTargetOf(state), now);

export const useIsCheckInDue = (): boolean => useAppStore((state) => selectIsCheckInDue(state));
