import { describe, expect, it } from 'vitest';

import type { RoadmapTask } from '../types';
import {
  buildSchedule,
  clampEstimatedWeeks,
  fits,
  overdueSummary,
  scheduleStatus,
  totalEstimatedWeeks,
  weeksUntil,
} from './schedule';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: 'Project is deployed and linked from the CV',
  steps: [],
  estimatedWeeks: 2,
  priority: 2,
  status: 'not_started',
  ...overrides,
});

const weeksFromNow = (weeks: number): string => new Date(NOW + weeks * WEEK_MS).toISOString();

describe('clampEstimatedWeeks', () => {
  it('keeps a value already in range', () => {
    expect(clampEstimatedWeeks(5)).toBe(5);
  });

  it('clamps to the 1-8 range', () => {
    expect(clampEstimatedWeeks(0)).toBe(1);
    expect(clampEstimatedWeeks(-3)).toBe(1);
    expect(clampEstimatedWeeks(99)).toBe(8);
  });

  it('rounds fractions', () => {
    expect(clampEstimatedWeeks(2.4)).toBe(2);
    expect(clampEstimatedWeeks(2.6)).toBe(3);
  });

  it('falls back to 2 for anything unusable', () => {
    expect(clampEstimatedWeeks(undefined)).toBe(2);
    expect(clampEstimatedWeeks('4')).toBe(2);
    expect(clampEstimatedWeeks(Number.NaN)).toBe(2);
    expect(clampEstimatedWeeks(Number.POSITIVE_INFINITY)).toBe(2);
  });
});

describe('totalEstimatedWeeks', () => {
  it('sums the tasks that are not done', () => {
    const total = totalEstimatedWeeks([
      task({ id: 'a', estimatedWeeks: 3 }),
      task({ id: 'b', estimatedWeeks: 2, status: 'in_progress' }),
      task({ id: 'c', estimatedWeeks: 5, status: 'done' }),
    ]);

    expect(total).toBe(5);
  });

  it('clamps out-of-range estimates before summing', () => {
    expect(totalEstimatedWeeks([task({ estimatedWeeks: 99 })])).toBe(8);
  });

  it('is 0 for an empty roadmap and for an all-done one', () => {
    expect(totalEstimatedWeeks([])).toBe(0);
    expect(totalEstimatedWeeks([task({ status: 'done', estimatedWeeks: 4 })])).toBe(0);
  });
});

describe('weeksUntil', () => {
  it('counts whole weeks ahead', () => {
    expect(weeksUntil(weeksFromNow(6), NOW)).toBe(6);
  });

  it('truncates a partial week', () => {
    expect(weeksUntil(new Date(NOW + 6 * WEEK_MS + 3 * DAY_MS).toISOString(), NOW)).toBe(6);
  });

  it('is 0 for a date inside this week', () => {
    expect(weeksUntil(new Date(NOW + 2 * DAY_MS).toISOString(), NOW)).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(weeksUntil(weeksFromNow(-3), NOW)).toBe(-3);
  });

  it('is 0 for an unparseable date', () => {
    expect(weeksUntil('not a date', NOW)).toBe(0);
  });
});

describe('fits', () => {
  it('fits when there is enough time', () => {
    const tasks = [task({ id: 'a', estimatedWeeks: 3 }), task({ id: 'b', estimatedWeeks: 2 })];

    expect(fits(tasks, weeksFromNow(8), NOW)).toEqual({
      fits: true,
      neededWeeks: 5,
      availableWeeks: 8,
    });
  });

  it('fits exactly when needed equals available', () => {
    expect(fits([task({ estimatedWeeks: 4 })], weeksFromNow(4), NOW).fits).toBe(true);
  });

  it('does not fit when the roadmap is longer than the runway', () => {
    const tasks = [task({ id: 'a', estimatedWeeks: 6 }), task({ id: 'b', estimatedWeeks: 6 })];

    expect(fits(tasks, weeksFromNow(4), NOW)).toEqual({
      fits: false,
      neededWeeks: 12,
      availableWeeks: 4,
    });
  });

  it('ignores done work when deciding', () => {
    const tasks = [task({ id: 'a', estimatedWeeks: 8, status: 'done' }), task({ id: 'b', estimatedWeeks: 2 })];

    expect(fits(tasks, weeksFromNow(3), NOW).fits).toBe(true);
  });

  it('does not fit once the target date has passed', () => {
    expect(fits([task({ estimatedWeeks: 1 })], weeksFromNow(-1), NOW).fits).toBe(false);
  });
});

describe('buildSchedule', () => {
  it('fits a feasible budget even when one-week minimums defeat proportional rounding', () => {
    const tasks = [1, 1, 8].map((estimatedWeeks, index) => task({ id: String(index), estimatedWeeks }));
    const scheduled = buildSchedule(tasks, weeksFromNow(5), NOW, 'ambitious');
    expect(scheduled.at(-1)?.targetDate).toBe(weeksFromNow(5));
  });
  it('lays comfortable tasks end to end from now', () => {
    const tasks = [
      task({ id: 'a', estimatedWeeks: 2 }),
      task({ id: 'b', estimatedWeeks: 3 }),
    ];

    const scheduled = buildSchedule(tasks, weeksFromNow(10), NOW, 'comfortable');

    expect(scheduled[0]?.targetDate).toBe(weeksFromNow(2));
    expect(scheduled[1]?.targetDate).toBe(weeksFromNow(5));
  });

  it('keeps full estimates in comfortable pace even when they overrun the date', () => {
    const tasks = [task({ id: 'a', estimatedWeeks: 6 }), task({ id: 'b', estimatedWeeks: 6 })];

    const scheduled = buildSchedule(tasks, weeksFromNow(4), NOW, 'comfortable');

    expect(scheduled[1]?.targetDate).toBe(weeksFromNow(12));
  });

  it('scales estimates down proportionally in ambitious pace', () => {
    // 12 weeks of work into 6: everything halves.
    const tasks = [task({ id: 'a', estimatedWeeks: 8 }), task({ id: 'b', estimatedWeeks: 4 })];

    const scheduled = buildSchedule(tasks, weeksFromNow(6), NOW, 'ambitious');

    expect(scheduled[0]?.targetDate).toBe(weeksFromNow(4));
    expect(scheduled[1]?.targetDate).toBe(weeksFromNow(6));
  });

  it('never scales a task below one week', () => {
    const tasks = [
      task({ id: 'a', estimatedWeeks: 8 }),
      task({ id: 'b', estimatedWeeks: 8 }),
      task({ id: 'c', estimatedWeeks: 8 }),
    ];

    const scheduled = buildSchedule(tasks, weeksFromNow(1), NOW, 'ambitious');

    expect(scheduled[0]?.targetDate).toBe(weeksFromNow(1));
    expect(scheduled[1]?.targetDate).toBe(weeksFromNow(2));
    expect(scheduled[2]?.targetDate).toBe(weeksFromNow(3));
  });

  it('does not stretch estimates when the work already fits', () => {
    const tasks = [task({ id: 'a', estimatedWeeks: 2 })];

    const scheduled = buildSchedule(tasks, weeksFromNow(40), NOW, 'ambitious');

    expect(scheduled[0]?.targetDate).toBe(weeksFromNow(2));
  });

  it('skips done tasks and leaves their dates alone', () => {
    const tasks = [
      task({ id: 'a', estimatedWeeks: 4, status: 'done', targetDate: weeksFromNow(-2) }),
      task({ id: 'b', estimatedWeeks: 3 }),
    ];

    const scheduled = buildSchedule(tasks, weeksFromNow(10), NOW, 'comfortable');

    expect(scheduled[0]?.targetDate).toBe(weeksFromNow(-2));
    expect(scheduled[1]?.targetDate).toBe(weeksFromNow(3));
  });

  it('keeps estimates whole when the target date has already passed', () => {
    const tasks = [task({ id: 'a', estimatedWeeks: 3 })];

    const scheduled = buildSchedule(tasks, weeksFromNow(-2), NOW, 'ambitious');

    expect(scheduled[0]?.targetDate).toBe(weeksFromNow(3));
  });

  it('returns an empty roadmap unchanged', () => {
    expect(buildSchedule([], weeksFromNow(4), NOW, 'comfortable')).toEqual([]);
  });
});

describe('scheduleStatus', () => {
  it('is on_track for a date more than a week out', () => {
    expect(scheduleStatus(task({ targetDate: weeksFromNow(3) }), NOW)).toBe('on_track');
  });

  it('is due_soon within 7 days', () => {
    expect(scheduleStatus(task({ targetDate: new Date(NOW + 3 * DAY_MS).toISOString() }), NOW)).toBe(
      'due_soon',
    );
    expect(scheduleStatus(task({ targetDate: weeksFromNow(1) }), NOW)).toBe('due_soon');
  });

  it('is overdue once the date has passed', () => {
    expect(scheduleStatus(task({ targetDate: new Date(NOW - DAY_MS).toISOString() }), NOW)).toBe(
      'overdue',
    );
  });

  it('is none for a done task, even an overdue one', () => {
    const done = task({ status: 'done', targetDate: new Date(NOW - DAY_MS).toISOString() });

    expect(scheduleStatus(done, NOW)).toBe('none');
  });

  it('is none without a target date, and for an unparseable one', () => {
    expect(scheduleStatus(task(), NOW)).toBe('none');
    expect(scheduleStatus(task({ targetDate: 'not a date' }), NOW)).toBe('none');
  });
});

describe('overdueSummary', () => {
  it('is null when nothing is overdue', () => {
    expect(overdueSummary([task({ targetDate: weeksFromNow(2) })], NOW)).toBeNull();
    expect(overdueSummary([], NOW)).toBeNull();
  });

  it('counts overdue milestones and points at the earliest', () => {
    const summary = overdueSummary(
      [
        task({ id: 'late', targetDate: weeksFromNow(-1) }),
        task({ id: 'later', targetDate: weeksFromNow(-3) }),
        task({ id: 'fine', targetDate: weeksFromNow(2) }),
      ],
      NOW,
    );

    expect(summary).toEqual({
      count: 2,
      firstId: 'later',
      label: '2 milestones past their date',
    });
  });

  it('reads naturally for a single milestone', () => {
    const summary = overdueSummary([task({ id: 'late', targetDate: weeksFromNow(-1) })], NOW);

    expect(summary?.label).toBe('1 milestone past its date');
  });

  it('ignores finished milestones, however old their date', () => {
    const summary = overdueSummary(
      [task({ id: 'done', status: 'done', targetDate: weeksFromNow(-8) })],
      NOW,
    );

    expect(summary).toBeNull();
  });

  it('ignores milestones with no date', () => {
    expect(overdueSummary([task({ id: 'undated' })], NOW)).toBeNull();
  });
});
