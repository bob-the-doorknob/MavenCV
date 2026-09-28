import type { MilestoneSort, RoadmapTask, TaskPriority } from '../types';

export interface StepProgress {
  done: number;
  total: number;
}

export interface OrderedRoadmap {
  /** The roadmap in its original order — the order is the plan. */
  tasks: readonly RoadmapTask[];
  /** The first not-started task, or null when there is none. */
  upNextId: string | null;
  /** The first in-progress task, or null when there is none. */
  inProgressId: string | null;
  /** The row the milestone path highlights: in progress, else up next. */
  currentId: string | null;
  doneCount: number;
  totalCount: number;
}

export const priorityLabels: Readonly<Record<TaskPriority, string>> = {
  3: 'High',
  2: 'Med',
  1: 'Low',
};

export const countSteps = (task: RoadmapTask): StepProgress => ({
  done: task.steps.filter((step) => step.done).length,
  total: task.steps.length,
});

/**
 * The milestone list keeps the roadmap's own order — it was generated as a
 * sequence, so reordering it would hide the plan. This only derives which
 * task the screen should point at.
 */
export const orderRoadmap = (tasks: readonly RoadmapTask[]): OrderedRoadmap => {
  const upNextId = tasks.find((task) => task.status === 'not_started')?.id ?? null;
  const inProgressId = tasks.find((task) => task.status === 'in_progress')?.id ?? null;

  return {
    tasks,
    upNextId,
    inProgressId,
    currentId: inProgressId ?? upNextId,
    doneCount: tasks.filter((task) => task.status === 'done').length,
    totalCount: tasks.length,
  };
};

export interface MetaLineOptions {
  /**
   * True on a roadmap where nothing has been started yet. The first milestone
   * then reads "Start here" rather than "Up next", so a new user can see
   * where to begin.
   */
  neverStarted?: boolean;
}

/** The meta line under a milestone title, e.g. "Med · In progress · 2/4 steps". */
export const taskMetaLine = (
  task: RoadmapTask,
  isUpNext: boolean,
  options: MetaLineOptions = {},
): string => {
  const parts: string[] = [priorityLabels[task.priority]];

  if (task.status === 'done') {
    parts.push('Done');
  } else if (task.status === 'in_progress') {
    parts.push('In progress');
  } else {
    parts.push(isUpNext ? (options.neverStarted ? 'Start here' : 'Up next') : 'Not started');
  }

  const steps = countSteps(task);
  if (task.status !== 'done' && steps.total > 0) {
    parts.push(`${steps.done}/${steps.total} steps`);
  }

  return parts.join(' · ');
};

/**
 * Orders the milestone list for display only — the stored roadmap order is
 * never touched, so switching back to 'roadmap' always restores the plan.
 *
 * Done milestones sink to the bottom in the derived views: they are history,
 * not work. 'roadmap' leaves everything exactly where the user put it.
 */
export const sortMilestones = (
  tasks: readonly RoadmapTask[],
  sort: MilestoneSort,
): readonly RoadmapTask[] => {
  if (sort === 'roadmap') {
    return tasks;
  }

  const position = new Map(tasks.map((task, index) => [task.id, index]));
  const byRoadmapOrder = (a: RoadmapTask, b: RoadmapTask): number =>
    (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);

  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) {
      return aDone - bDone;
    }

    if (sort === 'priority') {
      // 3 is the highest priority, so it comes first.
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return byRoadmapOrder(a, b);
    }

    // A milestone with no date cannot be ranked by one, so it sits last.
    const aDue = a.targetDate ? Date.parse(a.targetDate) : Number.NaN;
    const bDue = b.targetDate ? Date.parse(b.targetDate) : Number.NaN;
    const aHas = !Number.isNaN(aDue);
    const bHas = !Number.isNaN(bDue);
    if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    if (aHas && bHas && aDue !== bDue) {
      return aDue - bDue;
    }
    return byRoadmapOrder(a, b);
  });
};
