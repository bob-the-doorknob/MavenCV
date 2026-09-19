import type { RoadmapTask } from '../types';

export const calculateReadiness = (tasks: readonly RoadmapTask[]): number => {
  const weightedTasks = tasks.filter(
    ({ weight }) => Number.isFinite(weight) && weight > 0,
  );
  const totalWeight = weightedTasks.reduce((total, task) => total + task.weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  const completedWeight = weightedTasks.reduce(
    (total, task) => total + (task.status === 'done' ? task.weight : 0),
    0,
  );

  return Math.min(100, Math.max(0, Math.round((completedWeight / totalWeight) * 100)));
};
