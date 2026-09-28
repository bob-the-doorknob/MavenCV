import type { Target } from '../types';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1_000;

/**
 * Monday-based week index. Two timestamps in the same week share one.
 * Epoch Thursday means shifting by 4 days lands Monday on a boundary.
 */
const weekIndex = (timestamp: number): number =>
  Math.floor((timestamp + 3 * 24 * 60 * 60 * 1_000) / MS_PER_WEEK);

/** Every moment the user actually finished something on this target. */
export const completionTimestamps = (target: Target): number[] => {
  const stamps: number[] = [];

  for (const task of target.roadmap) {
    if (task.status === 'done' && task.completedAt) {
      const parsed = Date.parse(task.completedAt);
      if (!Number.isNaN(parsed)) {
        stamps.push(parsed);
      }
    }
    for (const step of task.steps) {
      if (step.done && step.completedAt) {
        const parsed = Date.parse(step.completedAt);
        if (!Number.isNaN(parsed)) {
          stamps.push(parsed);
        }
      }
    }
  }

  return stamps;
};

/**
 * Consecutive weeks with at least one completion, counting back from now.
 *
 * The current week not having activity yet does not break a streak — the week
 * is not over. It breaks once a whole week passes with nothing in it. Steps
 * finished before completion stamps existed simply do not count; the number is
 * only ever built from real, dated work.
 */
export const calculateStreak = (timestamps: readonly number[], now: number): number => {
  if (timestamps.length === 0) {
    return 0;
  }

  const active = new Set(timestamps.map(weekIndex));
  const thisWeek = weekIndex(now);

  // Start at this week if it already counts, otherwise at last week, so an
  // untouched-but-unfinished week is not treated as a break.
  let cursor = active.has(thisWeek) ? thisWeek : thisWeek - 1;
  let streak = 0;

  while (active.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  return streak;
};

/**
 * How many distinct weeks contain at least one completion. Unlike the streak
 * this does not care about gaps — it is a total, not a run.
 */
export const activeWeeks = (timestamps: readonly number[]): number =>
  new Set(timestamps.map(weekIndex)).size;

/** "3 week streak" / "1 week streak", or null when there is nothing to show. */
export const streakLabel = (streak: number): string | null =>
  streak > 0 ? `${streak} week${streak === 1 ? '' : 's'} in a row` : null;
