import { describe, expect, it } from 'vitest';

import type { CvEntry, RoadmapTask, Target } from '../types';
import { buildJourney, journeySummary } from './journey';

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

const done = (id: string, completedAt: string, overrides: Partial<RoadmapTask> = {}): RoadmapTask =>
  task({ id, status: 'done', completedAt, title: `Milestone ${id}`, ...overrides });

const target = (roadmap: RoadmapTask[]): Target => ({
  id: 'target-1',
  roleId: 'software-engineer',
  level: 'internship',
  experience: 'Two class projects.',
  createdAt: '2026-01-01T00:00:00.000Z',
  focusTaskIds: [],
  roadmap,
});

const entry = (overrides: Partial<CvEntry> = {}): CvEntry => ({
  id: 'entry-1',
  targetId: 'target-1',
  taskId: 'task-1',
  status: 'ready',
  text: 'Built 1 portfolio project.',
  createdAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

describe('buildJourney', () => {
  it('groups by month, newest month first', () => {
    const journey = buildJourney(
      target([
        done('a', '2026-07-10T00:00:00.000Z'),
        done('b', '2026-09-02T00:00:00.000Z'),
        done('c', '2026-09-20T00:00:00.000Z'),
      ]),
      [],
    );

    expect(journey.map((month) => month.key)).toEqual(['2026-09', '2026-07']);
    expect(journey[0]?.entries).toHaveLength(2);
  });

  it('orders entries within a month newest first', () => {
    const journey = buildJourney(
      target([done('old', '2026-09-02T00:00:00.000Z'), done('new', '2026-09-20T00:00:00.000Z')]),
      [],
    );

    expect(journey[0]?.entries.map((item) => item.taskId)).toEqual(['new', 'old']);
  });

  it('carries the notes and the bullet the milestone produced', () => {
    const journey = buildJourney(
      target([done('a', '2026-09-02T00:00:00.000Z', { notes: '  Shipped it.  ' })]),
      [entry({ taskId: 'a', text: 'Built 1 thing.' })],
    );

    expect(journey[0]?.entries[0]).toMatchObject({
      notes: 'Shipped it.',
      bullet: 'Built 1 thing.',
      bulletPending: false,
    });
  });

  it('flags a bullet that is still being written', () => {
    const journey = buildJourney(
      target([done('a', '2026-09-02T00:00:00.000Z')]),
      [entry({ taskId: 'a', status: 'pending', text: '' })],
    );

    expect(journey[0]?.entries[0]?.bulletPending).toBe(true);
    expect(journey[0]?.entries[0]).not.toHaveProperty('bullet');
  });

  it('omits a failed bullet rather than showing an empty one', () => {
    const journey = buildJourney(
      target([done('a', '2026-09-02T00:00:00.000Z')]),
      [entry({ taskId: 'a', status: 'failed', text: '' })],
    );

    expect(journey[0]?.entries[0]).not.toHaveProperty('bullet');
    expect(journey[0]?.entries[0]?.bulletPending).toBe(false);
  });

  it('ignores another target’s bullets', () => {
    const journey = buildJourney(
      target([done('a', '2026-09-02T00:00:00.000Z')]),
      [entry({ taskId: 'a', targetId: 'other', text: 'Not mine.' })],
    );

    expect(journey[0]?.entries[0]).not.toHaveProperty('bullet');
  });

  it('leaves out unfinished milestones', () => {
    const journey = buildJourney(
      target([done('a', '2026-09-02T00:00:00.000Z'), task({ id: 'b', status: 'in_progress' })]),
      [],
    );

    expect(journey[0]?.entries.map((item) => item.taskId)).toEqual(['a']);
  });

  it('leaves out done milestones with no date, rather than guessing one', () => {
    const journey = buildJourney(
      target([task({ id: 'undated', status: 'done' }), done('a', '2026-09-02T00:00:00.000Z')]),
      [],
    );

    expect(journey[0]?.entries.map((item) => item.taskId)).toEqual(['a']);
  });

  it('ignores an unparseable completion date', () => {
    const journey = buildJourney(target([done('broken', 'not a date')]), []);

    expect(journey).toEqual([]);
  });

  it('is empty when nothing is done', () => {
    expect(buildJourney(target([task()]), [])).toEqual([]);
  });
});

describe('journeySummary', () => {
  it('counts milestones, bullets, active weeks and readiness', () => {
    const summary = journeySummary(
      target([
        done('a', '2026-09-02T00:00:00.000Z', { priority: 1 }),
        done('b', '2026-09-20T00:00:00.000Z', { priority: 1 }),
        task({ id: 'c', priority: 2 }),
      ]),
      [entry({ id: '1', taskId: 'a' }), entry({ id: '2', taskId: 'b', text: 'Second.' })],
    );

    expect(summary).toEqual({
      milestonesCompleted: 2,
      bulletsWritten: 2,
      // Two completions three weeks apart sit in two different weeks.
      weeksActive: 2,
      readiness: 50,
    });
  });

  it('counts a done milestone with no date, even though the timeline cannot show it', () => {
    const summary = journeySummary(target([task({ id: 'undated', status: 'done' })]), []);

    expect(summary.milestonesCompleted).toBe(1);
    expect(summary.weeksActive).toBe(0);
  });

  it('does not count pending or failed bullets as written', () => {
    const summary = journeySummary(
      target([done('a', '2026-09-02T00:00:00.000Z')]),
      [
        entry({ id: '1', taskId: 'a', status: 'pending', text: '' }),
        entry({ id: '2', taskId: 'a', status: 'failed', text: '' }),
      ],
    );

    expect(summary.bulletsWritten).toBe(0);
  });

  it('is all zeroes for an untouched target', () => {
    expect(journeySummary(target([task()]), [])).toEqual({
      milestonesCompleted: 0,
      bulletsWritten: 0,
      weeksActive: 0,
      readiness: 0,
    });
  });
});
