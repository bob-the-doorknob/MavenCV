import type { RoadmapTask, TaskPriority } from '../types';

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

/** The meta line under a milestone title, e.g. "Med · In progress · 2/4 steps". */
export const taskMetaLine = (task: RoadmapTask, isUpNext: boolean): string => {
  const parts: string[] = [priorityLabels[task.priority]];

  if (task.status === 'done') {
    parts.push('Done');
  } else if (task.status === 'in_progress') {
    parts.push('In progress');
  } else {
    parts.push(isUpNext ? 'Up next' : 'Not started');
  }

  const steps = countSteps(task);
  if (task.status !== 'done' && steps.total > 0) {
    parts.push(`${steps.done}/${steps.total} steps`);
  }

  return parts.join(' · ');
};
