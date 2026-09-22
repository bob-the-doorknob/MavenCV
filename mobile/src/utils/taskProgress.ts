import type { RoadmapTask } from '../types';

export const advanceTask = (task: RoadmapTask, now: string = new Date().toISOString()): RoadmapTask => {
  if (task.status === 'not_started') return { ...task, status: 'in_progress' };
  if (task.status === 'in_progress') return { ...task, status: 'done', completedAt: now };
  const { completedAt: _completedAt, ...rest } = task;
  return { ...rest, status: 'not_started' };
};
