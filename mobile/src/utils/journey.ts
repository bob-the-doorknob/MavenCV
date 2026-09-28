import type { CvEntry, Target } from '../types';
import { calculateReadiness } from './readiness';
import { activeWeeks, completionTimestamps } from './streak';

export interface JourneyEntry {
  taskId: string;
  title: string;
  /** ISO timestamp the milestone was completed. */
  completedAt: string;
  notes?: string;
  /** The bullet this milestone produced, if one has been written. */
  bullet?: string;
  /** True while the bullet is still being written. */
  bulletPending: boolean;
}

export interface JourneyMonth {
  /** Sortable key, e.g. "2026-09". */
  key: string;
  entries: JourneyEntry[];
}

export interface JourneySummary {
  milestonesCompleted: number;
  bulletsWritten: number;
  weeksActive: number;
  readiness: number;
}

const monthKey = (iso: string): string => iso.slice(0, 7);

/**
 * What the user has actually finished, newest first, grouped by month.
 *
 * Only milestones with a real completion date appear — a done milestone with
 * no timestamp cannot be placed on a timeline, and guessing one would put
 * invented history in front of the user.
 */
export const buildJourney = (target: Target, entries: readonly CvEntry[]): JourneyMonth[] => {
  const bulletFor = (taskId: string): CvEntry | undefined =>
    [...entries].reverse().find((entry) => entry.targetId === target.id && entry.taskId === taskId);

  const completed = target.roadmap
    .filter((task) => task.status === 'done' && task.completedAt)
    .map((task) => {
      const parsed = Date.parse(task.completedAt as string);
      return { task, parsed };
    })
    .filter(({ parsed }) => !Number.isNaN(parsed))
    .sort((a, b) => b.parsed - a.parsed);

  const months = new Map<string, JourneyEntry[]>();

  for (const { task } of completed) {
    const completedAt = task.completedAt as string;
    const bullet = bulletFor(task.id);
    const entry: JourneyEntry = {
      taskId: task.id,
      title: task.title,
      completedAt,
      bulletPending: bullet?.status === 'pending',
      ...(task.notes?.trim() ? { notes: task.notes.trim() } : {}),
      ...(bullet?.status === 'ready' && bullet.text.trim() ? { bullet: bullet.text.trim() } : {}),
    };

    const key = monthKey(completedAt);
    const existing = months.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      months.set(key, [entry]);
    }
  }

  return [...months.entries()]
    .map(([key, monthEntries]) => ({ key, entries: monthEntries }))
    .sort((a, b) => b.key.localeCompare(a.key));
};

export const journeySummary = (target: Target, entries: readonly CvEntry[]): JourneySummary => ({
  milestonesCompleted: target.roadmap.filter((task) => task.status === 'done').length,
  bulletsWritten: entries.filter(
    (entry) => entry.targetId === target.id && entry.status === 'ready' && entry.text.trim(),
  ).length,
  weeksActive: activeWeeks(completionTimestamps(target)),
  readiness: calculateReadiness(target.roadmap),
});
