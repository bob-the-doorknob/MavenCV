import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import type { Level } from '../data/roles';
import type {
  CvEntry,
  CvEntryStatus,
  MilestoneSort,
  RoadmapTask,
  SchedulePace,
  Target,
  TaskPriority,
  TaskStatus,
  TaskStep,
} from '../types';
import { buildSchedule, clampEstimatedWeeks } from '../utils/schedule';
import { createId } from '../utils/id';
import { calculateReadiness } from '../utils/readiness';

const STORE_VERSION = 1;
// Separate from persisted state: reporting a read failure must never write over it.
export const useStorageStatus = create<{ ready: boolean; error: string | null }>(() => ({ ready: false, error: null }));

/** At most this many tasks can be in focus at once. */
export const MAX_FOCUS_TASKS = 2;

const CHECK_IN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface PersistedAppState {
  targets: Target[];
  activeTargetId: string | null;
  cvEntries: CvEntry[];
}

const emptyState: PersistedAppState = {
  targets: [],
  activeTargetId: null,
  cvEntries: [],
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
type PersistedTarget = Omit<Target, 'roadmap' | 'focusTaskIds'> & {
  roadmap: PersistedRoadmapTask[];
  focusTaskIds?: string[];
};

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
  Array.isArray(value.roadmap) &&
  value.roadmap.every(isRoadmapTask);

const isCvEntry = (value: unknown): value is CvEntry =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.targetId) &&
  isString(value.taskId) &&
  isCvEntryStatus(value.status) &&
  isString(value.text) &&
  isOptional(value.suggestions, isStringArray) &&
  isString(value.createdAt);

interface PersistedShape {
  targets: PersistedTarget[];
  activeTargetId: string | null;
  cvEntries: CvEntry[];
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
    throw new Error('Saved data could not be loaded. It has not been deleted.');
  }
  const persisted = persistedState as PersistedShape;
  const targets = persisted.targets.map(normalizeTarget);
  return { ...persisted, targets, activeTargetId: targets.some((target) => target.id === persisted.activeTargetId)
    ? persisted.activeTargetId : targets[0]?.id ?? null };
};

export type AddTargetInput = Omit<
  Target,
  'id' | 'createdAt' | 'roadmap' | 'focusTaskIds' | 'lastCheckInAt'
> & {
  roadmap?: RoadmapTask[];
};

export type AddCvEntryInput = Omit<CvEntry, 'id' | 'createdAt'>;

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
}

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
    (set, get) => ({
      ...emptyState,

      addTarget: (input) => {
        const id = createId();
        const target: Target = {
          focusTaskIds: [],
          ...input,
          id,
          createdAt: new Date().toISOString(),
          roadmap: input.roadmap ?? [],
        };
        set((state) => ({ targets: [...state.targets, target], activeTargetId: id }));
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
            steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step)),
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
            steps.map((step) => (step.done ? step : { ...step, done: true })),
          ),
        })),

      addCvEntry: (entry) => {
        const id = createId();
        const cvEntry: CvEntry = { ...entry, id, createdAt: new Date().toISOString() };
        set((state) => ({ cvEntries: [...state.cvEntries, cvEntry] }));
        return id;
      },

      updateCvEntry: (id, updates) =>
        set((state) => ({
          cvEntries: state.cvEntries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)),
        })),

      resetAll: () => set(emptyState),
    }),
    {
      name: 'trajectory-app-state',
      version: STORE_VERSION,
      storage: createJSONStorage(() => ({
        ...AsyncStorage,
        setItem: async (name: string, value: string) => {
          // Subsequent saves replace the backup too, so explicitly deleted personal
          // data is not retained in a stale migration copy.
          await AsyncStorage.setItem(`${name}-pre-migration-backup`, value);
          await AsyncStorage.setItem(name, value);
        },
        getItem: async (name: string) => {
          const saved = await AsyncStorage.getItem(name);
          if (saved !== null) await AsyncStorage.setItem(`${name}-pre-migration-backup`, saved);
          return saved;
        },
      })),
      onRehydrateStorage: () => {
        useStorageStatus.setState({ ready: false, error: null });
        return (_state, error) => useStorageStatus.setState({ ready: !error,
          error: error ? 'Saved data could not be loaded. Your original data is preserved. Retry or contact support; do not reinstall the app.' : null });
      },
      // Runs on every rehydration (not just version bumps), so a same-version
      // but corrupted or pre-redesign payload still resets safely.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrate(persistedState),
      }),
      partialize: ({ targets, activeTargetId, cvEntries }) => ({ targets, activeTargetId, cvEntries }),
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
