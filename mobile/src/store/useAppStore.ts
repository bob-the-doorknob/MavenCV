import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import type { Level } from '../data/roles';
import type {
  CvEntry,
  CvEntryStatus,
  RoadmapTask,
  SchedulePace,
  Target,
  TaskPriority,
  TaskStatus,
  TaskStep,
} from '../types';
import { clampEstimatedWeeks } from '../utils/schedule';
import { createId } from '../utils/id';
import { calculateReadiness } from '../utils/readiness';

const STORE_VERSION = 1;

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
  const check = checkPersistedAppState(persistedState);
  if (!check.ok) {
    console.warn(`Maven: resetting persisted app state — ${check.reason}.`);
    return emptyState;
  }
  const persisted = persistedState as PersistedShape;
  return { ...persisted, targets: persisted.targets.map(normalizeTarget) };
};

export type AddTargetInput = Omit<
  Target,
  'id' | 'createdAt' | 'roadmap' | 'focusTaskIds' | 'lastCheckInAt'
> & {
  roadmap?: RoadmapTask[];
};

export type AddCvEntryInput = Omit<CvEntry, 'id' | 'createdAt'>;

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
  startTask: (taskId: string) => void;
  /** Don't call this directly from a screen — use completeTaskAndQueue from services/tasks.ts, which also fires the CV-bullet queue. */
  completeTask: (taskId: string, notes: string) => void;
  editTask: (
    taskId: string,
    updates: Partial<Pick<RoadmapTask, 'title' | 'doneWhen' | 'priority' | 'notes'>>,
  ) => void;
  deleteTask: (taskId: string) => void;
  /** Appends a user-created milestone to the active target's roadmap. */
  addMilestone: (input: AddMilestoneInput) => string;
  /** Reorders the active roadmap. Unknown ids are ignored; omitted tasks keep their order at the end. */
  reorderTasks: (taskIds: string[]) => void;
  setTargetDate: (date: string) => void;
  clearTargetDate: () => void;
  setSchedulePace: (pace: SchedulePace) => void;
  toggleStep: (taskId: string, stepId: string) => void;
  addStep: (taskId: string, title: string) => void;
  removeStep: (taskId: string, stepId: string) => void;
  /** Keeps at most MAX_FOCUS_TASKS ids, dropping unknown and already-done tasks. */
  setFocusTasks: (taskIds: string[]) => void;
  recordCheckIn: () => void;
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

      startTask: (taskId) =>
        set((state) => ({
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) =>
            tasks.map((task) =>
              task.id === taskId
                ? { ...task, status: 'in_progress', startedAt: task.startedAt ?? new Date().toISOString() }
                : task,
            ),
          ),
        })),

      completeTask: (taskId, notes) => {
        const { targets, activeTargetId } = get();
        const activeTarget = targets.find((target) => target.id === activeTargetId);
        if (!activeTarget?.roadmap.some((task) => task.id === taskId)) {
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
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            roadmap: target.roadmap.map((task) =>
              task.id === taskId ? { ...task, status: 'done', completedAt, notes } : task,
            ),
            // Focus is for what's still open — a finished task drops out of it.
            focusTaskIds: target.focusTaskIds.filter((id) => id !== taskId),
          })),
          cvEntries: [...state.cvEntries, cvEntry],
        }));
      },

      editTask: (taskId, updates) =>
        set((state) => ({
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) =>
            tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
          ),
        })),

      deleteTask: (taskId) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            roadmap: target.roadmap.filter((task) => task.id !== taskId),
            focusTaskIds: target.focusTaskIds.filter((id) => id !== taskId),
          })),
          // Drop not-yet-earned entries for this task (pending/failed); a
          // 'ready' entry is an earned CV line and survives.
          cvEntries: state.cvEntries.filter((entry) => entry.taskId !== taskId || entry.status === 'ready'),
        })),

      addMilestone: (input) => {
        const id = createId();
        const milestone: RoadmapTask = {
          id,
          title: input.title.trim(),
          doneWhen: input.doneWhen.trim(),
          priority: input.priority,
          estimatedWeeks: clampEstimatedWeeks(input.estimatedWeeks),
          steps: [],
          status: 'not_started',
        };
        set((state) => ({
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) => [...tasks, milestone]),
        }));
        return id;
      },

      reorderTasks: (taskIds) =>
        set((state) => ({
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) => {
            const ordered = taskIds
              .map((id) => tasks.find((task) => task.id === id))
              .filter((task): task is RoadmapTask => task !== undefined);
            const rest = tasks.filter((task) => !taskIds.includes(task.id));
            return [...ordered, ...rest];
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
            return rest;
          }),
        })),

      setSchedulePace: (pace) =>
        set((state) => ({
          targets: mapActiveTarget(state.targets, state.activeTargetId, (target) => ({
            ...target,
            schedulePace: pace,
          })),
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
      storage: createJSONStorage(() => AsyncStorage),
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

export const useActiveRoadmap = (): RoadmapTask[] =>
  useAppStore((state) => state.targets.find((target) => target.id === state.activeTargetId)?.roadmap ?? []);

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
