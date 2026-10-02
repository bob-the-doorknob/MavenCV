import { beforeAll, describe, expect, it, vi } from 'vitest';

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

import type { RoadmapTask } from '../types';
import { migrate, useAppStore } from './useAppStore';

/**
 * Invariant: whatever an action leaves in memory is exactly what loading the
 * same data from disk would produce. If they differ, two devices holding the
 * "same" record disagree about it, and sync pushes forever (the bug the
 * two-device test caught). Every action runs here in turn, and the records
 * are checked after each one.
 */

/** Deliberately bare: no weight, no steps, out-of-range estimate — what an API or a caller might hand in. */
const bareTask = (id: string): RoadmapTask =>
  ({ id, title: `Task ${id}`, doneWhen: 'Done', priority: 3, status: 'not_started', estimatedWeeks: 99 }) as unknown as RoadmapTask;

const store = () => useAppStore.getState();
const activeId = (): string => store().activeTargetId as string;
const firstEntryId = (): string => store().cvEntries[0]?.id as string;

const steps: Array<[string, () => void]> = [
  ['addTarget', () => void store().addTarget({ roleId: 'software-engineer', level: 'internship', experience: 'x', roadmap: [bareTask('a'), bareTask('b'), bareTask('c')] })],
  ['addTarget (second)', () => void store().addTarget({ roleId: 'data-analyst', level: 'entry-level', experience: 'y' })],
  ['setActiveTarget', () => store().setActiveTarget(store().targets[0]?.id ?? null)],
  ['updateTargetProfile', () => store().updateTargetProfile(activeId(), { employer: '  Acme  ', experience: ' more ' })],
  ['startTask', () => store().startTask('a')],
  ['addStep', () => store().addStep('a', 'First step')],
  ['addStep (second)', () => store().addStep('a', 'Second step')],
  ['toggleStep', () => store().toggleStep('a', store().targets[0]?.roadmap[0]?.steps[0]?.id ?? '')],
  ['moveStep', () => store().moveStep('a', store().targets[0]?.roadmap[0]?.steps[1]?.id ?? '', -1)],
  ['completeAllSteps', () => store().completeAllSteps('a')],
  ['removeStep', () => store().removeStep('a', store().targets[0]?.roadmap[0]?.steps[0]?.id ?? '')],
  ['editTask', () => store().editTask('b', { title: 'Renamed', priority: 1 })],
  ['setEstimatedWeeks', () => store().setEstimatedWeeks('b', 42)],
  ['setFocusTasks', () => store().setFocusTasks(['a', 'b', 'c'])],
  ['setTargetDate', () => store().setTargetDate('2027-06-01T00:00:00.000Z')],
  ['setSchedulePace', () => store().setSchedulePace('ambitious')],
  ['applySchedule', () => store().applySchedule('comfortable')],
  ['reorderTasks', () => store().reorderTasks(['c', 'a', 'b'])],
  ['addMilestone', () => void store().addMilestone({ title: ' New ', doneWhen: ' When ', priority: 2, estimatedWeeks: 0 })],
  ['completeTask', () => store().completeTask('a', 'Shipped it.')],
  ['updateCvEntry', () => store().updateCvEntry(firstEntryId(), { status: 'ready', text: 'Built [X] things.' })],
  ['addCvEntry', () => void store().addCvEntry({ targetId: activeId(), taskId: 'c', status: 'ready', text: 'Bare entry.' })],
  ['deleteCvEntry', () => store().deleteCvEntry(firstEntryId())],
  ['undoDelete (entry)', () => store().undoDelete()],
  ['deleteTask', () => store().deleteTask('c')],
  ['undoDelete (task)', () => store().undoDelete()],
  ['clearPendingUndo', () => store().clearPendingUndo()],
  ['replaceUnfinishedRoadmap', () => store().replaceUnfinishedRoadmap([bareTask('d'), bareTask('e')])],
  ['setMilestoneSort', () => store().setMilestoneSort('dueDate')],
  ['recordCheckIn', () => store().recordCheckIn()],
  ['markReadyCelebrated', () => store().markReadyCelebrated()],
  ['clearTargetDate', () => store().clearTargetDate()],
  ['showCompletionNotice', () => store().showCompletionNotice('Done', 'a')],
  ['clearCompletionNotice', () => store().clearCompletionNotice()],
  ['saveOnboardingDraft', () => store().saveOnboardingDraft({ step: 'role', roleId: null, customTitle: '', level: null, employer: '', experience: '', targetDate: null, savedAt: '2026-10-02T00:00:00.000Z' })],
  ['clearOnboardingDraft', () => store().clearOnboardingDraft()],
  ['mergeRemote', () => void store().mergeRemote({ targets: [], cvEntries: [] }, 'v1')],
  ['setSyncMeta', () => store().setSyncMeta({ lastSyncedAt: '2026-10-02T00:00:00.000Z' })],
  ['repairFutureStamps', () => store().repairFutureStamps(Date.now() - 10 * 24 * 60 * 60 * 1_000)],
  ['replaceAccountCopy', () => store().replaceAccountCopy({ targets: [], cvEntries: [] }, 'v2')],
  ['removeTarget', () => store().removeTarget(store().targets[1]?.id ?? '')],
  ['resetAll', () => store().resetAll()],
];

describe('every action leaves records in their load-time normalised form', () => {
  beforeAll(() => {
    store().resetAll();
  });

  it.each(steps)('%s', (_name, run) => {
    run();
    const state = store();
    const reloaded = migrate(JSON.parse(JSON.stringify({
      targets: state.targets,
      activeTargetId: state.activeTargetId,
      cvEntries: state.cvEntries,
      onboardingDraft: state.onboardingDraft,
      tombstones: state.tombstones,
      sync: state.sync,
    })));

    expect(reloaded.targets).toEqual(state.targets);
    expect(reloaded.cvEntries).toEqual(state.cvEntries);
  });
});
