import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real module reaches for `window`, which doesn't exist under vitest's
// node environment. Persist middleware only needs get/set/remove to resolve.
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

import type { CvEntry, RoadmapTask, Target } from '../types';
import { calculateReadiness } from '../utils/readiness';
import { migrate, useAppStore } from './useAppStore';

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: 'Project is deployed and linked from the CV',
  priority: 1,
  status: 'not_started',
  ...overrides,
});

const baseTargetInput = {
  roleId: 'software-engineer',
  level: 'internship' as const,
  experience: 'Two class projects in TypeScript.',
};

/** Minimal but structurally complete — no optional fields set. */
const fullTarget = (overrides: Partial<Target> = {}): Target => ({
  id: 'target-1',
  roleId: 'software-engineer',
  level: 'internship',
  experience: 'Two class projects in TypeScript.',
  createdAt: '2026-01-01T00:00:00.000Z',
  roadmap: [task()],
  ...overrides,
});

const fullCvEntry = (overrides: Partial<CvEntry> = {}): CvEntry => ({
  id: 'entry-1',
  targetId: 'target-1',
  taskId: 'task-1',
  status: 'pending',
  text: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  useAppStore.getState().resetAll();
});

describe('completeTask', () => {
  it('updates state synchronously and creates a pending CV entry, without touching the network', () => {
    const { addTarget, completeTask } = useAppStore.getState();
    const targetId = addTarget({ ...baseTargetInput, roadmap: [task()] });

    completeTask('task-1', 'Shipped the project and wrote the README.');

    // No await: the assertions below only pass if the update already landed.
    const state = useAppStore.getState();
    const target = state.targets.find((candidate) => candidate.id === targetId) as Target;
    const completedTask = target.roadmap.find((candidate) => candidate.id === 'task-1');

    expect(completedTask?.status).toBe('done');
    expect(completedTask?.completedAt).toEqual(expect.any(String));
    expect(completedTask?.notes).toBe('Shipped the project and wrote the README.');

    expect(state.cvEntries).toHaveLength(1);
    expect(state.cvEntries[0]).toMatchObject({
      targetId,
      taskId: 'task-1',
      status: 'pending',
      text: '',
    });
  });

  it('does nothing when the task does not belong to the active target', () => {
    const { addTarget, completeTask } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task()] });

    completeTask('missing-task', 'notes');

    expect(useAppStore.getState().cvEntries).toHaveLength(0);
  });
});

describe('deleteTask', () => {
  it('changes the readiness score', () => {
    const { addTarget, deleteTask } = useAppStore.getState();
    addTarget({
      ...baseTargetInput,
      roadmap: [
        task({ id: 'done', priority: 2, status: 'done' }),
        task({ id: 'todo', priority: 1, status: 'not_started' }),
      ],
    });

    const before = calculateReadiness(useAppStore.getState().targets[0]?.roadmap ?? []);
    expect(before).toBe(67);

    deleteTask('todo');

    const after = calculateReadiness(useAppStore.getState().targets[0]?.roadmap ?? []);
    expect(after).toBe(100);
  });

  it('removes a pending CV entry for the deleted task', () => {
    const { addTarget, completeTask, deleteTask } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task()] });
    completeTask('task-1', 'notes');
    expect(useAppStore.getState().cvEntries[0]?.status).toBe('pending');

    deleteTask('task-1');

    expect(useAppStore.getState().cvEntries).toHaveLength(0);
  });

  it('removes a failed CV entry for the deleted task', () => {
    const { addTarget, completeTask, deleteTask, updateCvEntry } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task()] });
    completeTask('task-1', 'notes');
    const entryId = useAppStore.getState().cvEntries[0]?.id as string;
    updateCvEntry(entryId, { status: 'failed' });

    deleteTask('task-1');

    expect(useAppStore.getState().cvEntries).toHaveLength(0);
  });

  it('keeps a ready CV entry (an earned CV line) for the deleted task', () => {
    const { addTarget, completeTask, deleteTask, updateCvEntry } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task()] });
    completeTask('task-1', 'notes');
    const entryId = useAppStore.getState().cvEntries[0]?.id as string;
    updateCvEntry(entryId, { status: 'ready', text: 'Built 1 portfolio project.' });

    deleteTask('task-1');

    expect(useAppStore.getState().cvEntries).toHaveLength(1);
    expect(useAppStore.getState().cvEntries[0]?.status).toBe('ready');
  });
});

describe('removeTarget', () => {
  it('deletes the removed target — and, since the user explicitly removed it, its CV entries too', () => {
    const { addTarget, completeTask, removeTarget } = useAppStore.getState();
    const targetId = addTarget({ ...baseTargetInput, roadmap: [task()] });
    completeTask('task-1', 'notes');
    expect(useAppStore.getState().cvEntries).toHaveLength(1);

    removeTarget(targetId);

    expect(useAppStore.getState().targets).toHaveLength(0);
    expect(useAppStore.getState().cvEntries).toHaveLength(0);
  });

  it('leaves other targets and their CV entries alone', () => {
    const { addTarget, completeTask, removeTarget } = useAppStore.getState();
    const keepId = addTarget({ ...baseTargetInput, roadmap: [task()] });
    completeTask('task-1', 'notes');
    const removeId = addTarget({ ...baseTargetInput, roadmap: [task({ id: 'task-2' })] });
    useAppStore.getState().setActiveTarget(removeId);
    useAppStore.getState().completeTask('task-2', 'notes');

    removeTarget(removeId);

    const state = useAppStore.getState();
    expect(state.targets.map((target) => target.id)).toEqual([keepId]);
    expect(state.cvEntries).toHaveLength(1);
    expect(state.cvEntries[0]?.targetId).toBe(keepId);
  });
});

describe('migrate', () => {
  it('rehydrates valid current-shape data unchanged, including populated optional fields', () => {
    const valid = {
      targets: [
        fullTarget({
          employer: 'Example Corp',
          roadmap: [
            task({
              startedAt: '2026-01-02T00:00:00.000Z',
              completedAt: '2026-01-03T00:00:00.000Z',
              notes: 'Shipped it.',
              notificationId: 'notif-1',
            }),
          ],
        }),
      ],
      activeTargetId: 'target-1',
      cvEntries: [fullCvEntry({ status: 'ready', text: 'Built 1 thing.', suggestions: ['Add a metric.'] })],
    };

    expect(migrate(valid)).toEqual(valid);
  });

  it('keeps an unrecognized extra field instead of resetting', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withExtra = {
      targets: [{ ...fullTarget(), legacyWeight: 5 }],
      activeTargetId: 'target-1',
      cvEntries: [fullCvEntry()],
      appBuild: '0.1.0',
    };

    expect(migrate(withExtra)).toEqual(withExtra);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('keeps data missing an optional field instead of resetting', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // fullTarget()/task()/fullCvEntry() default to no optional fields set.
    const missingOptionals = {
      targets: [fullTarget()],
      activeTargetId: 'target-1',
      cvEntries: [fullCvEntry()],
    };

    expect(migrate(missingOptionals)).toEqual(missingOptionals);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('resets and warns when a required field is missing or wrong-typed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      targets: [{ ...fullTarget(), id: 42 }], // id must be a string
      activeTargetId: null,
      cvEntries: [],
    };

    expect(migrate(broken)).toEqual({ targets: [], activeTargetId: null, cvEntries: [] });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('targets');

    warnSpy.mockRestore();
  });

  it('resets silently (no warning) when nothing has been persisted yet', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(migrate(undefined)).toEqual({ targets: [], activeTargetId: null, cvEntries: [] });
    expect(migrate(null)).toEqual({ targets: [], activeTargetId: null, cvEntries: [] });
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('resets and warns for an entirely different, pre-redesign shape', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const preRedesign = { targetRoles: [{ id: 'old' }], activeTargetRoleId: 'old', cvEntries: [] };

    expect(migrate(preRedesign)).toEqual({ targets: [], activeTargetId: null, cvEntries: [] });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
