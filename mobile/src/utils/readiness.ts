import type { RoadmapTask } from '../types';

export const calculateReadiness = (tasks: readonly RoadmapTask[]): number => {
  if (tasks.length === 0) {
    return 0;
  }

  const totalPriority = tasks.reduce((total, task) => total + task.priority, 0);
  const donePriority = tasks.reduce(
    (total, task) => total + (task.status === 'done' ? task.priority : 0),
    0,
  );

  return Math.round((donePriority / totalPriority) * 100);
};
