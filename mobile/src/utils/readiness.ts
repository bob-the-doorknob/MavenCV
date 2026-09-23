import type { RoadmapTask } from '../types';

export const calculateReadiness = (tasks: readonly RoadmapTask[]): number => {
  if (tasks.length === 0) {
    return 0;
  }

  const weight = (task: RoadmapTask): number =>
    typeof task.weight === 'number' && Number.isFinite(task.weight) && task.weight > 0 ? task.weight : task.priority;
  const totalPriority = tasks.reduce((total, task) => total + weight(task), 0);
  const donePriority = tasks.reduce(
    (total, task) => total + (task.status === 'done' ? weight(task) : 0),
    0,
  );

  return Math.round((donePriority / totalPriority) * 100);
};
