import type { RoadmapTask, SchedulePace } from '../types';

export const MIN_ESTIMATED_WEEKS = 1;
export const MAX_ESTIMATED_WEEKS = 8;
export const DEFAULT_ESTIMATED_WEEKS = 2;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1_000;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;
const DUE_SOON_DAYS = 7;

export type ScheduleStatus = 'on_track' | 'due_soon' | 'overdue' | 'none';

export interface ScheduleFit {
  fits: boolean;
  neededWeeks: number;
  availableWeeks: number;
}

/** Rounds into the 1-8 week range. Anything unusable becomes the default. */
export const clampEstimatedWeeks = (weeks: unknown): number => {
  if (typeof weeks !== 'number' || !Number.isFinite(weeks)) {
    return DEFAULT_ESTIMATED_WEEKS;
  }
  return Math.min(MAX_ESTIMATED_WEEKS, Math.max(MIN_ESTIMATED_WEEKS, Math.round(weeks)));
};

/** Work still ahead: done tasks cost nothing. */
export const totalEstimatedWeeks = (tasks: readonly RoadmapTask[]): number =>
  tasks
    .filter((task) => task.status !== 'done')
    .reduce((total, task) => total + clampEstimatedWeeks(task.estimatedWeeks), 0);

/**
 * Whole weeks from `now` until `date`. Negative once the date has passed, and
 * 0 for an unparseable date — treat that as no time left, never as infinite.
 */
export const weeksUntil = (date: string, now: number): number => {
  const target = Date.parse(date);
  if (Number.isNaN(target)) {
    return 0;
  }
  return Math.trunc((target - now) / MS_PER_WEEK);
};

export const fits = (
  tasks: readonly RoadmapTask[],
  targetDate: string,
  now: number,
): ScheduleFit => {
  const neededWeeks = totalEstimatedWeeks(tasks);
  const availableWeeks = weeksUntil(targetDate, now);
  return { fits: neededWeeks <= availableWeeks, neededWeeks, availableWeeks };
};

/**
 * Lays the remaining tasks out in roadmap order, each finishing after its own
 * estimate. 'comfortable' keeps every estimate whole and overruns the target
 * date when the work does not fit; 'ambitious' scales the estimates down
 * proportionally to fit, never below one week per task.
 *
 * Done tasks are left exactly as they are — their dates are history.
 */
export const buildSchedule = (
  tasks: readonly RoadmapTask[],
  targetDate: string,
  now: number,
  pace: SchedulePace,
): RoadmapTask[] => {
  const neededWeeks = totalEstimatedWeeks(tasks);
  const availableWeeks = weeksUntil(targetDate, now);
  const remainingCount = tasks.filter((task) => task.status !== 'done').length;

  // Scaling below 1 week per task would be a lie, so 'ambitious' compresses
  // only as far as the floor allows.
  const scale =
    pace === 'ambitious' && neededWeeks > 0 && availableWeeks > 0 && availableWeeks < neededWeeks
      ? availableWeeks / neededWeeks
      : 1;

  let cursor = now;

  return tasks.map((task) => {
    if (task.status === 'done') {
      return task;
    }

    const estimate = clampEstimatedWeeks(task.estimatedWeeks);
    const weeks =
      remainingCount > 0 && scale < 1
        ? Math.max(MIN_ESTIMATED_WEEKS, Math.round(estimate * scale))
        : estimate;

    cursor += weeks * MS_PER_WEEK;
    return { ...task, targetDate: new Date(cursor).toISOString() };
  });
};

export const scheduleStatus = (task: RoadmapTask, now: number): ScheduleStatus => {
  if (task.status === 'done' || !task.targetDate) {
    return 'none';
  }
  const due = Date.parse(task.targetDate);
  if (Number.isNaN(due)) {
    return 'none';
  }
  if (due < now) {
    return 'overdue';
  }
  return due - now <= DUE_SOON_DAYS * MS_PER_DAY ? 'due_soon' : 'on_track';
};
