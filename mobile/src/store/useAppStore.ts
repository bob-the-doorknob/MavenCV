import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Level } from '../data/roles';
import type { CvEntry, CvEntryStatus, RoadmapTask, Target, TaskPriority, TaskStatus } from '../types';
import { createId } from '../utils/id';
import { calculateReadiness } from '../utils/readiness';

const STORE_VERSION = 1;

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

const isTaskStatus = (value: unknown): value is TaskStatus =>
  value === 'not_started' || value === 'in_progress' || value === 'done';
const isTaskPriority = (value: unknown): value is TaskPriority => value === 1 || value === 2 || value === 3;
const isLevel = (value: unknown): value is Level => value === 'internship' || value === 'entry-level';
const isCvEntryStatus = (value: unknown): value is CvEntryStatus =>
  value === 'pending' || value === 'ready' || value === 'failed';

/**
 * Every check below only requires the fields the app actually reads
 * (RoadmapTask/Target/CvEntry's required fields). Unknown extra fields and
 * absent optional fields are both fine — only a missing or wrong-typed
 * required field fails validation.
 */
const isRoadmapTask = (value: unknown): value is RoadmapTask =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.title) &&
  isString(value.doneWhen) &&
  isTaskPriority(value.priority) &&
  isTaskStatus(value.status) &&
  isOptional(value.startedAt, isString) &&
  isOptional(value.completedAt, isString) &&
  isOptional(value.notes, isString) &&
  isOptional(value.notificationId, isString);

const isTarget = (value: unknown): value is Target =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.roleId) &&
  isOptional(value.customTitle, isString) &&
  isLevel(value.level) &&
  isOptional(value.employer, isString) &&
  isString(value.experience) &&
  isString(value.createdAt) &&
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
    console.warn(`Trajectory: resetting persisted app state — ${check.reason}.`);
    return emptyState;
  }
  return persistedState as PersistedAppState;
};

export type AddTargetInput = Omit<Target, 'id' | 'createdAt' | 'roadmap'> & {
  roadmap?: RoadmapTask[];
};

export type AddCvEntryInput = Omit<CvEntry, 'id' | 'createdAt'>;

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
  addCvEntry: (entry: AddCvEntryInput) => string;
  updateCvEntry: (id: string, updates: Partial<Pick<CvEntry, 'status' | 'text' | 'suggestions'>>) => void;
  resetAll: () => void;
}

/** Applies `map` to the active target's roadmap only; other targets pass through unchanged. */
const mapActiveRoadmap = (
  targets: Target[],
  activeTargetId: string | null,
  map: (tasks: RoadmapTask[]) => RoadmapTask[],
): Target[] =>
  targets.map((target) => (target.id === activeTargetId ? { ...target, roadmap: map(target.roadmap) } : target));

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...emptyState,

      addTarget: (input) => {
        const id = createId();
        const target: Target = {
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
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) =>
            tasks.map((task) => (task.id === taskId ? { ...task, status: 'done', completedAt, notes } : task)),
          ),
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
          targets: mapActiveRoadmap(state.targets, state.activeTargetId, (tasks) =>
            tasks.filter((task) => task.id !== taskId),
          ),
          // Drop not-yet-earned entries for this task (pending/failed); a
          // 'ready' entry is an earned CV line and survives.
          cvEntries: state.cvEntries.filter((entry) => entry.taskId !== taskId || entry.status === 'ready'),
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

export const useActiveTarget = (): Target | null =>
  useAppStore((state) => state.targets.find((target) => target.id === state.activeTargetId) ?? null);

export const useActiveRoadmap = (): RoadmapTask[] =>
  useAppStore((state) => state.targets.find((target) => target.id === state.activeTargetId)?.roadmap ?? []);

export const useReadiness = (): number => calculateReadiness(useActiveRoadmap());
