import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import type { CvEntry, RoadmapTask, Target, TaskStep } from '../types';
import { calculateReadiness } from '../utils/readiness';
import { migrate, selectFocusTasks, selectIsCheckInDue, useAppStore } from './useAppStore';

const step = (overrides: Partial<TaskStep> = {}): TaskStep => ({
  id: 'step-1',
  title: 'Set up the repository',
  done: false,
  ...overrides,
});

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: 'Project is deployed and linked from the CV',
  steps: [],
  estimatedWeeks: 2,
  priority: 1,
  weight: overrides.priority ?? 1,
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
  focusTaskIds: [],
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

it('migrates the original scaffold without losing tasks, weights or CV bullets', () => {
  const result = migrate({ targetRoles: [{ id: 'legacy-role', title: 'Engineer', createdAt: '2026-01-01',
    tasks: [{ id: 'legacy-task', title: 'Build 1 app', weight: 75, status: 'done' }] }],
    activeTargetRoleId: 'legacy-role', cvEntries: [{ id: 'legacy-bullet', targetRoleId: 'legacy-role',
      sourceTaskId: 'legacy-task', text: 'Built 1 app.', createdAt: '2026-01-02' }] });
  expect(result.activeTargetId).toBe('legacy-role');
  expect(result.targets[0]?.roadmap[0]).toMatchObject({ id: 'legacy-task', weight: 75, status: 'done' });
  expect(result.cvEntries[0]).toMatchObject({ text: 'Built 1 app.', targetId: 'legacy-role', taskId: 'legacy-task', status: 'ready' });
});

it('does not create duplicate CV entries when completion is tapped twice', () => {
  useAppStore.getState().addTarget({ ...baseTargetInput, roadmap: [task()] });
  useAppStore.getState().completeTask('task-1', 'Built 1 app.');
  useAppStore.getState().completeTask('task-1', 'Built 1 app.');
  expect(useAppStore.getState().cvEntries).toHaveLength(1);
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

describe('updateTargetProfile', () => {
  it('updates level, employer and experience without touching the roadmap', () => {
    const { addTarget, updateTargetProfile } = useAppStore.getState();
    const id = addTarget({ ...baseTargetInput, roadmap: [task()] });

    updateTargetProfile(id, {
      level: 'entry-level',
      employer: '  Example Corp  ',
      experience: '  Shipped 2 apps.  ',
    });

    const updated = useAppStore.getState().targets[0];
    expect(updated).toMatchObject({
      level: 'entry-level',
      employer: 'Example Corp',
      experience: 'Shipped 2 apps.',
    });
    expect(updated?.roadmap).toHaveLength(1);
    expect(updated?.roadmap[0]?.id).toBe('task-1');
  });

  it('drops the employer when it is cleared', () => {
    const { addTarget, updateTargetProfile } = useAppStore.getState();
    const id = addTarget({ ...baseTargetInput, employer: 'Example Corp', roadmap: [] });

    updateTargetProfile(id, { employer: '   ' });

    expect(useAppStore.getState().targets[0]).not.toHaveProperty('employer');
  });

  it('leaves fields that were not passed alone', () => {
    const { addTarget, updateTargetProfile } = useAppStore.getState();
    const id = addTarget({ ...baseTargetInput, employer: 'Example Corp', roadmap: [] });

    updateTargetProfile(id, { level: 'entry-level' });

    expect(useAppStore.getState().targets[0]).toMatchObject({
      employer: 'Example Corp',
      experience: baseTargetInput.experience,
      level: 'entry-level',
    });
  });

  it('ignores an unknown target', () => {
    const { addTarget, updateTargetProfile } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [] });

    updateTargetProfile('ghost', { level: 'entry-level' });

    expect(useAppStore.getState().targets[0]?.level).toBe('internship');
  });
});

describe('replaceUnfinishedRoadmap', () => {
  const seed = (): void => {
    useAppStore.getState().addTarget({
      ...baseTargetInput,
      roadmap: [
        task({ id: 'done-1', status: 'done' }),
        task({ id: 'open-1', status: 'in_progress' }),
        task({ id: 'open-2' }),
      ],
    });
  };

  it('keeps finished milestones and appends the new ones', () => {
    seed();

    useAppStore.getState().replaceUnfinishedRoadmap([task({ id: 'fresh-1' }), task({ id: 'fresh-2' })]);

    expect(useAppStore.getState().targets[0]?.roadmap.map((entry) => entry.id)).toEqual([
      'done-1',
      'fresh-1',
      'fresh-2',
    ]);
  });

  it('keeps earned bullets but drops ones that were never written', () => {
    const { addTarget, completeTask, updateCvEntry, replaceUnfinishedRoadmap } =
      useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'done-1' }), task({ id: 'open-1' })] });

    completeTask('done-1', 'Shipped it.');
    const earned = useAppStore.getState().cvEntries[0]?.id as string;
    updateCvEntry(earned, { status: 'ready', text: 'Built 1 thing.' });
    // A pending bullet against a milestone that is about to be replaced.
    useAppStore.getState().addCvEntry({ targetId: useAppStore.getState().targets[0]?.id as string, taskId: 'open-1', status: 'pending', text: '' });

    replaceUnfinishedRoadmap([task({ id: 'fresh-1' })]);

    const entries = useAppStore.getState().cvEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(earned);
  });

  it('drops focus on milestones that no longer exist', () => {
    seed();
    useAppStore.getState().setFocusTasks(['open-1', 'open-2']);

    useAppStore.getState().replaceUnfinishedRoadmap([task({ id: 'fresh-1' })]);

    expect(useAppStore.getState().targets[0]?.focusTaskIds).toEqual([]);
  });

  it('does nothing when there is no active target', () => {
    useAppStore.getState().replaceUnfinishedRoadmap([task({ id: 'fresh-1' })]);

    expect(useAppStore.getState().targets).toEqual([]);
  });

  it('leaves other targets untouched', () => {
    const { addTarget, setActiveTarget, replaceUnfinishedRoadmap } = useAppStore.getState();
    const first = addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' })] });
    const second = addTarget({ ...baseTargetInput, roadmap: [task({ id: 'b' })] });
    setActiveTarget(second);

    replaceUnfinishedRoadmap([task({ id: 'fresh-1' })]);

    const targets = useAppStore.getState().targets;
    expect(targets.find((entry) => entry.id === first)?.roadmap.map((entry) => entry.id)).toEqual(['a']);
    expect(targets.find((entry) => entry.id === second)?.roadmap.map((entry) => entry.id)).toEqual([
      'fresh-1',
    ]);
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

    expect(() => migrate(broken)).toThrow('Saved data');
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

    expect(() => migrate(preRedesign)).toThrow('Saved data');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('normalizes pre-steps, pre-focus data instead of resetting it', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Exactly what v1 wrote: no steps on tasks, no focusTaskIds on targets.
    const legacy = {
      targets: [
        {
          id: 'target-1',
          roleId: 'software-engineer',
          level: 'internship',
          experience: 'Two class projects in TypeScript.',
          createdAt: '2026-01-01T00:00:00.000Z',
          roadmap: [
            {
              id: 'task-1',
              title: 'Build 1 portfolio project',
              doneWhen: 'Project is deployed and linked from the CV',
              priority: 1,
              status: 'not_started',
            },
          ],
        },
      ],
      activeTargetId: 'target-1',
      cvEntries: [],
    };

    const migrated = migrate(legacy);

    expect(migrated.targets[0]?.focusTaskIds).toEqual([]);
    expect(migrated.targets[0]?.roadmap[0]?.steps).toEqual([]);
    expect(migrated.targets[0]?.roadmap[0]?.title).toBe('Build 1 portfolio project');
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('keeps steps, why, focusTaskIds, and lastCheckInAt that are already persisted', () => {
    const current = {
      targets: [
        fullTarget({
          focusTaskIds: ['task-1'],
          lastCheckInAt: '2026-02-01T00:00:00.000Z',
          roadmap: [
            task({
              why: 'Recruiters screen for finished work.',
              steps: [{ id: 'step-1', title: 'Write the README', done: true }],
            }),
          ],
        }),
      ],
      activeTargetId: 'target-1',
      cvEntries: [],
    };

    expect(migrate(current)).toEqual(current);
  });

  it('resets when steps are present but wrong-typed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      targets: [{ ...fullTarget(), roadmap: [{ ...task(), steps: ['not an object'] }] }],
      activeTargetId: 'target-1',
      cvEntries: [],
    };

    expect(() => migrate(broken)).toThrow('Saved data');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

describe('addMilestone', () => {
  const roadmapOf = (): RoadmapTask[] => useAppStore.getState().targets[0]?.roadmap ?? [];

  it('appends a not-started milestone marked as user-created', () => {
    const { addTarget, addMilestone } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' })] });

    const id = addMilestone({
      title: 'Ship 1 side project',
      doneWhen: 'Deployed with 3 users',
      priority: 3,
      estimatedWeeks: 4,
    });

    const added = roadmapOf()[1];
    expect(roadmapOf().map((entry) => entry.id)).toEqual(['a', id]);
    expect(added).toMatchObject({
      title: 'Ship 1 side project',
      doneWhen: 'Deployed with 3 users',
      priority: 3,
      estimatedWeeks: 4,
      status: 'not_started',
      createdByUser: true,
      steps: [],
    });
  });

  it('trims the title and done-when', () => {
    const { addTarget, addMilestone } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [] });

    addMilestone({
      title: '  Ship 1 side project  ',
      doneWhen: '  Deployed  ',
      priority: 2,
      estimatedWeeks: 2,
    });

    expect(roadmapOf()[0]).toMatchObject({ title: 'Ship 1 side project', doneWhen: 'Deployed' });
  });

  it('clamps the estimate into the 1-8 week range', () => {
    const { addTarget, addMilestone } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [] });

    addMilestone({ title: 'Long one', doneWhen: '', priority: 2, estimatedWeeks: 99 });

    expect(roadmapOf()[0]?.estimatedWeeks).toBe(8);
  });

  it('counts towards the readiness score like any other task', () => {
    const { addTarget, addMilestone } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a', priority: 1, status: 'done' })] });
    expect(calculateReadiness(roadmapOf())).toBe(100);

    addMilestone({ title: 'New work', doneWhen: '', priority: 1, estimatedWeeks: 2 });

    expect(calculateReadiness(roadmapOf())).toBe(50);
  });

  it('schedules the new milestone when a target date is set', () => {
    const { addTarget, setTargetDate, applySchedule, addMilestone } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a', estimatedWeeks: 2 })] });
    setTargetDate(new Date(Date.now() + 30 * 7 * 86_400_000).toISOString());
    applySchedule('comfortable');

    addMilestone({ title: 'New work', doneWhen: '', priority: 2, estimatedWeeks: 3 });

    expect(roadmapOf()[1]?.targetDate).toEqual(expect.any(String));
  });

  it('leaves dates unset when there is no target date', () => {
    const { addTarget, addMilestone } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [] });

    addMilestone({ title: 'New work', doneWhen: '', priority: 2, estimatedWeeks: 3 });

    expect(roadmapOf()[0]?.targetDate).toBeUndefined();
  });
});

describe('reorderTasks', () => {
  const idsOf = (): string[] => (useAppStore.getState().targets[0]?.roadmap ?? []).map((t) => t.id);

  const seedThree = (): void => {
    useAppStore.getState().addTarget({
      ...baseTargetInput,
      roadmap: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
    });
  };

  it('applies the given order', () => {
    seedThree();

    useAppStore.getState().reorderTasks(['c', 'a', 'b']);

    expect(idsOf()).toEqual(['c', 'a', 'b']);
  });

  it('keeps omitted tasks, in their original order, at the end', () => {
    seedThree();

    useAppStore.getState().reorderTasks(['c']);

    expect(idsOf()).toEqual(['c', 'a', 'b']);
  });

  it('ignores unknown ids', () => {
    seedThree();

    useAppStore.getState().reorderTasks(['ghost', 'b', 'a']);

    expect(idsOf()).toEqual(['b', 'a', 'c']);
  });

  it('does nothing to an empty order', () => {
    seedThree();

    useAppStore.getState().reorderTasks([]);

    expect(idsOf()).toEqual(['a', 'b', 'c']);
  });

  it('re-dates the roadmap when a target date is set', () => {
    const { addTarget, setTargetDate, applySchedule, reorderTasks } = useAppStore.getState();
    addTarget({
      ...baseTargetInput,
      roadmap: [task({ id: 'a', estimatedWeeks: 1 }), task({ id: 'b', estimatedWeeks: 6 })],
    });
    setTargetDate(new Date(Date.now() + 30 * 7 * 86_400_000).toISOString());
    applySchedule('comfortable');
    const firstDateBefore = useAppStore.getState().targets[0]?.roadmap[0]?.targetDate;

    reorderTasks(['b', 'a']);

    // 'b' now runs first, so the first slot's due date moves out by its longer estimate.
    expect(useAppStore.getState().targets[0]?.roadmap[0]?.id).toBe('b');
    expect(useAppStore.getState().targets[0]?.roadmap[0]?.targetDate).not.toBe(firstDateBefore);
  });
});

describe('step actions', () => {
  const seed = (): void => {
    const { addTarget } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ steps: [step()] })] });
  };

  const stepsOf = (taskId = 'task-1'): TaskStep[] =>
    useAppStore.getState().targets[0]?.roadmap.find((candidate) => candidate.id === taskId)?.steps ?? [];

  it('toggles a step both ways without touching the task status', () => {
    seed();

    useAppStore.getState().toggleStep('task-1', 'step-1');
    expect(stepsOf()[0]?.done).toBe(true);

    useAppStore.getState().toggleStep('task-1', 'step-1');
    expect(stepsOf()[0]?.done).toBe(false);
    expect(useAppStore.getState().targets[0]?.roadmap[0]?.status).toBe('not_started');
  });

  it('adds a trimmed step and ignores a blank title', () => {
    seed();

    useAppStore.getState().addStep('task-1', '  Draft the README  ');
    expect(stepsOf()).toHaveLength(2);
    expect(stepsOf()[1]).toMatchObject({ title: 'Draft the README', done: false });

    useAppStore.getState().addStep('task-1', '   ');
    expect(stepsOf()).toHaveLength(2);
  });

  it('removes a step', () => {
    seed();

    useAppStore.getState().removeStep('task-1', 'step-1');

    expect(stepsOf()).toEqual([]);
  });

  it('leaves the readiness score alone — steps are guidance, not progress', () => {
    seed();
    const before = calculateReadiness(useAppStore.getState().targets[0]?.roadmap ?? []);

    useAppStore.getState().toggleStep('task-1', 'step-1');
    useAppStore.getState().addStep('task-1', 'Another step');

    expect(calculateReadiness(useAppStore.getState().targets[0]?.roadmap ?? [])).toBe(before);
  });

  it('ignores a step action for a task that is not in the active roadmap', () => {
    seed();

    useAppStore.getState().toggleStep('missing-task', 'step-1');

    expect(stepsOf()[0]?.done).toBe(false);
  });
});

describe('setFocusTasks', () => {
  const focusIds = (): string[] => useAppStore.getState().targets[0]?.focusTaskIds ?? [];

  const seedThree = (): void => {
    const { addTarget } = useAppStore.getState();
    addTarget({
      ...baseTargetInput,
      roadmap: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
    });
  };

  it('keeps at most two tasks', () => {
    seedThree();

    useAppStore.getState().setFocusTasks(['a', 'b', 'c']);

    expect(focusIds()).toEqual(['a', 'b']);
  });

  it('drops done tasks and unknown ids', () => {
    const { addTarget } = useAppStore.getState();
    addTarget({
      ...baseTargetInput,
      roadmap: [task({ id: 'a', status: 'done' }), task({ id: 'b' })],
    });

    useAppStore.getState().setFocusTasks(['a', 'ghost', 'b']);

    expect(focusIds()).toEqual(['b']);
  });

  it('deduplicates ids', () => {
    seedThree();

    useAppStore.getState().setFocusTasks(['a', 'a', 'b']);

    expect(focusIds()).toEqual(['a', 'b']);
  });

  it('drops a focus task when it is completed', () => {
    seedThree();
    useAppStore.getState().setFocusTasks(['a', 'b']);

    useAppStore.getState().completeTask('a', 'Shipped it.');

    expect(focusIds()).toEqual(['b']);
  });

  it('drops a focus task when it is deleted', () => {
    seedThree();
    useAppStore.getState().setFocusTasks(['a', 'b']);

    useAppStore.getState().deleteTask('b');

    expect(focusIds()).toEqual(['a']);
  });
});

describe('selectFocusTasks', () => {
  it('returns the focused tasks in the order they were chosen', () => {
    const { addTarget, setFocusTasks } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' }), task({ id: 'b' })] });
    setFocusTasks(['b', 'a']);

    expect(selectFocusTasks(useAppStore.getState()).map((focused) => focused.id)).toEqual(['b', 'a']);
  });

  it('returns nothing when there is no active target', () => {
    expect(selectFocusTasks(useAppStore.getState())).toEqual([]);
  });
});

describe('markReadyCelebrated', () => {
  it('stamps the active target once and never moves the stamp', () => {
    const { addTarget, markReadyCelebrated } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ status: 'done' })] });

    markReadyCelebrated();
    const first = useAppStore.getState().targets[0]?.readyCelebratedAt;
    expect(first).toEqual(expect.any(String));

    markReadyCelebrated();

    expect(useAppStore.getState().targets[0]?.readyCelebratedAt).toBe(first);
  });

  it('does nothing when there is no active target', () => {
    useAppStore.getState().markReadyCelebrated();

    expect(useAppStore.getState().targets).toEqual([]);
  });
});

describe('check-ins', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const seedWithFocus = (createdAt: string): void => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(createdAt));
    const { addTarget, setFocusTasks } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' })] });
    setFocusTasks(['a']);
  };

  it('is not due before 7 days have passed since the target was created', () => {
    seedWithFocus('2026-03-01T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-03-07T23:59:00.000Z'));

    expect(selectIsCheckInDue(useAppStore.getState())).toBe(false);
  });

  it('is due exactly 7 days after creation when there has never been a check-in', () => {
    seedWithFocus('2026-03-01T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-03-08T00:00:00.000Z'));

    expect(selectIsCheckInDue(useAppStore.getState())).toBe(true);
  });

  it('recordCheckIn pushes the next check-in out by another 7 days', () => {
    seedWithFocus('2026-03-01T00:00:00.000Z');
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'));
    expect(selectIsCheckInDue(useAppStore.getState())).toBe(true);

    useAppStore.getState().recordCheckIn();

    expect(useAppStore.getState().targets[0]?.lastCheckInAt).toBe('2026-03-10T00:00:00.000Z');
    expect(selectIsCheckInDue(useAppStore.getState())).toBe(false);

    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'));
    expect(selectIsCheckInDue(useAppStore.getState())).toBe(true);
  });

  it('is never due for a target with nothing in focus', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    useAppStore.getState().addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' })] });

    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));

    expect(selectIsCheckInDue(useAppStore.getState())).toBe(false);
  });

  it('is never due when there is no active target', () => {
    expect(selectIsCheckInDue(useAppStore.getState(), Date.parse('2026-06-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('undoDelete', () => {
  it('puts a deleted milestone back where it was', () => {
    const { addTarget, deleteTask, undoDelete } = useAppStore.getState();
    addTarget({
      ...baseTargetInput,
      roadmap: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
    });

    deleteTask('b');
    expect(useAppStore.getState().targets[0]?.roadmap.map((entry) => entry.id)).toEqual(['a', 'c']);

    undoDelete();

    expect(useAppStore.getState().targets[0]?.roadmap.map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(useAppStore.getState().pendingUndo).toBeNull();
  });

  it('restores the bullets a milestone delete discarded', () => {
    const { addTarget, completeTask, deleteTask, undoDelete } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' })] });
    completeTask('a', 'notes');
    expect(useAppStore.getState().cvEntries).toHaveLength(1);

    deleteTask('a');
    expect(useAppStore.getState().cvEntries).toHaveLength(0);

    undoDelete();

    expect(useAppStore.getState().cvEntries).toHaveLength(1);
  });

  it('restores focus that the delete dropped', () => {
    const { addTarget, setFocusTasks, deleteTask, undoDelete } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' }), task({ id: 'b' })] });
    setFocusTasks(['a', 'b']);

    deleteTask('a');
    expect(useAppStore.getState().targets[0]?.focusTaskIds).toEqual(['b']);

    undoDelete();

    expect(useAppStore.getState().targets[0]?.focusTaskIds).toEqual(['a', 'b']);
  });

  it('puts a deleted CV bullet back at its old position', () => {
    const { addTarget, addCvEntry, deleteCvEntry, undoDelete } = useAppStore.getState();
    const targetId = addTarget({ ...baseTargetInput, roadmap: [task()] });
    addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'First.' });
    const second = addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'Second.' });
    addCvEntry({ targetId, taskId: 'task-1', status: 'ready', text: 'Third.' });

    deleteCvEntry(second);
    expect(useAppStore.getState().cvEntries.map((entry) => entry.text)).toEqual([
      'First.',
      'Third.',
    ]);

    undoDelete();

    expect(useAppStore.getState().cvEntries.map((entry) => entry.text)).toEqual([
      'First.',
      'Second.',
      'Third.',
    ]);
  });

  it('does nothing when there is nothing to undo', () => {
    const { addTarget, undoDelete } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task()] });

    undoDelete();

    expect(useAppStore.getState().targets[0]?.roadmap).toHaveLength(1);
  });

  it('is dropped once cleared, so a stale banner cannot resurrect anything', () => {
    const { addTarget, deleteTask, clearPendingUndo, undoDelete } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task({ id: 'a' })] });

    deleteTask('a');
    clearPendingUndo();
    undoDelete();

    expect(useAppStore.getState().targets[0]?.roadmap).toHaveLength(0);
  });
});

describe('step ordering', () => {
  const stepsOf = (): string[] =>
    (useAppStore.getState().targets[0]?.roadmap[0]?.steps ?? []).map((entry) => entry.id);

  const seed = (): void => {
    useAppStore.getState().addTarget({
      ...baseTargetInput,
      roadmap: [
        task({ steps: [step({ id: '1' }), step({ id: '2' }), step({ id: '3' })] }),
      ],
    });
  };

  it('moves a step up and down', () => {
    seed();

    useAppStore.getState().moveStep('task-1', '3', -1);
    expect(stepsOf()).toEqual(['1', '3', '2']);

    useAppStore.getState().moveStep('task-1', '3', 1);
    expect(stepsOf()).toEqual(['1', '2', '3']);
  });

  it('ignores a move past either end', () => {
    seed();

    useAppStore.getState().moveStep('task-1', '1', -1);
    useAppStore.getState().moveStep('task-1', '3', 1);

    expect(stepsOf()).toEqual(['1', '2', '3']);
  });

  it('ignores an unknown step', () => {
    seed();

    useAppStore.getState().moveStep('task-1', 'ghost', 1);

    expect(stepsOf()).toEqual(['1', '2', '3']);
  });

  it('marks every step done at once, leaving finished ones alone', () => {
    useAppStore.getState().addTarget({
      ...baseTargetInput,
      roadmap: [task({ steps: [step({ id: '1', done: true }), step({ id: '2' })] })],
    });

    useAppStore.getState().completeAllSteps('task-1');

    expect(
      (useAppStore.getState().targets[0]?.roadmap[0]?.steps ?? []).every((entry) => entry.done),
    ).toBe(true);
  });

  it('does not change the task status or score', () => {
    seed();
    const before = calculateReadiness(useAppStore.getState().targets[0]?.roadmap ?? []);

    useAppStore.getState().completeAllSteps('task-1');

    expect(useAppStore.getState().targets[0]?.roadmap[0]?.status).toBe('not_started');
    expect(calculateReadiness(useAppStore.getState().targets[0]?.roadmap ?? [])).toBe(before);
  });
});

describe('setMilestoneSort', () => {
  it('remembers the choice on the active target', () => {
    const { addTarget, setMilestoneSort } = useAppStore.getState();
    addTarget({ ...baseTargetInput, roadmap: [task()] });

    setMilestoneSort('priority');

    expect(useAppStore.getState().targets[0]?.milestoneSort).toBe('priority');
  });

  it('keeps it per target', () => {
    const { addTarget, setActiveTarget, setMilestoneSort } = useAppStore.getState();
    const first = addTarget({ ...baseTargetInput, roadmap: [] });
    setMilestoneSort('priority');
    const second = addTarget({ ...baseTargetInput, roadmap: [] });
    setMilestoneSort('dueDate');

    const targets = useAppStore.getState().targets;
    expect(targets.find((entry) => entry.id === first)?.milestoneSort).toBe('priority');
    expect(targets.find((entry) => entry.id === second)?.milestoneSort).toBe('dueDate');
    setActiveTarget(first);
  });
});
