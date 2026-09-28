import { describe, expect, it } from 'vitest';

import type { RoadmapTask, Target } from '../types';
import { calculateStreak, completionTimestamps, streakLabel } from './streak';

// A Wednesday, so week boundaries are unambiguous in both directions.
const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const WEEK = 7 * 24 * 60 * 60 * 1_000;

const weeksAgo = (weeks: number): number => NOW - weeks * WEEK;

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: '',
  steps: [],
  estimatedWeeks: 2,
  priority: 2,
  status: 'not_started',
  ...overrides,
});

const target = (roadmap: RoadmapTask[]): Target => ({
  id: 'target-1',
  roleId: 'software-engineer',
  level: 'internship',
  experience: 'Two class projects.',
  createdAt: '2026-01-01T00:00:00.000Z',
  focusTaskIds: [],
  roadmap,
});

describe('calculateStreak', () => {
  it('is 0 with no completions', () => {
    expect(calculateStreak([], NOW)).toBe(0);
  });

  it('counts this week alone as 1', () => {
    expect(calculateStreak([NOW - 1_000], NOW)).toBe(1);
  });

  it('counts consecutive weeks', () => {
    expect(calculateStreak([weeksAgo(0), weeksAgo(1), weeksAgo(2)], NOW)).toBe(3);
  });

  it('does not break just because this week is still empty', () => {
    expect(calculateStreak([weeksAgo(1), weeksAgo(2)], NOW)).toBe(2);
  });

  it('breaks on a whole missed week', () => {
    expect(calculateStreak([weeksAgo(2), weeksAgo(3)], NOW)).toBe(0);
  });

  it('counts only the run that reaches the present', () => {
    expect(calculateStreak([weeksAgo(0), weeksAgo(1), weeksAgo(5), weeksAgo(6)], NOW)).toBe(2);
  });

  it('treats several completions in one week as one week', () => {
    const sameWeek = [NOW - 1_000, NOW - 2_000, NOW - 3_000];

    expect(calculateStreak(sameWeek, NOW)).toBe(1);
  });

  it('ignores completions in the future rather than inflating the streak', () => {
    expect(calculateStreak([NOW + 4 * WEEK], NOW)).toBe(0);
  });
});

describe('completionTimestamps', () => {
  it('collects finished milestones and finished steps', () => {
    const stamps = completionTimestamps(
      target([
        task({
          id: 'a',
          status: 'done',
          completedAt: new Date(weeksAgo(1)).toISOString(),
          steps: [
            { id: 's1', title: 'One', done: true, completedAt: new Date(weeksAgo(2)).toISOString() },
            { id: 's2', title: 'Two', done: false },
          ],
        }),
      ]),
    );

    expect(stamps).toHaveLength(2);
  });

  it('ignores work with no timestamp, rather than guessing one', () => {
    const stamps = completionTimestamps(
      target([
        task({ id: 'a', status: 'done' }),
        task({ id: 'b', steps: [{ id: 's1', title: 'One', done: true }] }),
      ]),
    );

    expect(stamps).toEqual([]);
  });

  it('ignores unparseable timestamps', () => {
    const stamps = completionTimestamps(
      target([task({ id: 'a', status: 'done', completedAt: 'not a date' })]),
    );

    expect(stamps).toEqual([]);
  });

  it('ignores a stamp on a step that is not done', () => {
    const stamps = completionTimestamps(
      target([
        task({
          id: 'a',
          steps: [{ id: 's1', title: 'One', done: false, completedAt: new Date(NOW).toISOString() }],
        }),
      ]),
    );

    expect(stamps).toEqual([]);
  });
});

describe('streakLabel', () => {
  it('reads naturally for one and many', () => {
    expect(streakLabel(1)).toBe('1 week in a row');
    expect(streakLabel(4)).toBe('4 weeks in a row');
  });

  it('shows nothing at zero rather than a hollow badge', () => {
    expect(streakLabel(0)).toBeNull();
  });
});
