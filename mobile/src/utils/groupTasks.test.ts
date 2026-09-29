import { describe, expect, it } from 'vitest';

import type { RoadmapTask, TaskStep } from '../types';
import { countSteps, orderRoadmap, sortMilestones, taskMetaLine } from './groupTasks';

const step = (overrides: Partial<TaskStep> = {}): TaskStep => ({
  id: 'step-1',
  title: 'Set up the repository',
  done: false,
  ...overrides,
});

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

describe('orderRoadmap', () => {
  it('keeps the roadmap in its original order', () => {
    const tasks = [
      task({ id: 'a', status: 'not_started' }),
      task({ id: 'b', status: 'done' }),
      task({ id: 'c', status: 'in_progress' }),
    ];

    expect(orderRoadmap(tasks).tasks.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('picks the first not-started task as up next', () => {
    const tasks = [
      task({ id: 'a', status: 'done' }),
      task({ id: 'b', status: 'not_started' }),
      task({ id: 'c', status: 'not_started' }),
    ];

    expect(orderRoadmap(tasks).upNextId).toBe('b');
  });

  it('highlights the in-progress task over up next', () => {
    const tasks = [task({ id: 'a', status: 'not_started' }), task({ id: 'b', status: 'in_progress' })];

    const ordered = orderRoadmap(tasks);

    expect(ordered.inProgressId).toBe('b');
    expect(ordered.upNextId).toBe('a');
    expect(ordered.currentId).toBe('b');
  });

  it('falls back to up next when nothing is in progress', () => {
    const tasks = [task({ id: 'a', status: 'done' }), task({ id: 'b', status: 'not_started' })];

    expect(orderRoadmap(tasks).currentId).toBe('b');
  });

  it('counts done tasks and totals', () => {
    const tasks = [
      task({ id: 'a', status: 'done' }),
      task({ id: 'b', status: 'done' }),
      task({ id: 'c', status: 'in_progress' }),
    ];

    const ordered = orderRoadmap(tasks);

    expect(ordered.doneCount).toBe(2);
    expect(ordered.totalCount).toBe(3);
  });

  it('handles an empty roadmap', () => {
    expect(orderRoadmap([])).toEqual({
      tasks: [],
      upNextId: null,
      inProgressId: null,
      currentId: null,
      doneCount: 0,
      totalCount: 0,
    });
  });

  it('reports no current task when everything is done', () => {
    const ordered = orderRoadmap([task({ id: 'a', status: 'done' })]);

    expect(ordered.currentId).toBeNull();
  });
});

describe('countSteps', () => {
  it('counts done steps against the total', () => {
    const counted = countSteps(
      task({ steps: [step({ id: '1', done: true }), step({ id: '2' }), step({ id: '3', done: true })] }),
    );

    expect(counted).toEqual({ done: 2, total: 3 });
  });

  it('returns zeroes for a task with no steps', () => {
    expect(countSteps(task())).toEqual({ done: 0, total: 0 });
  });
});

describe('taskMetaLine', () => {
  it('gives a done task no meta line at all', () => {
    const done = task({ status: 'done', priority: 3, steps: [step({ done: true })] });

    expect(taskMetaLine(done, false)).toBe('');
  });

  it('never mentions priority — that lives on the milestone screen', () => {
    const inProgress = task({ status: 'in_progress', priority: 3, steps: [step()] });

    expect(taskMetaLine(inProgress, false)).not.toContain('High');
  });

  it('shows step progress for an in-progress task', () => {
    const inProgress = task({
      status: 'in_progress',
      priority: 2,
      steps: [step({ id: '1', done: true }), step({ id: '2' })],
    });

    expect(taskMetaLine(inProgress, false)).toBe('1/2 steps');
  });

  it('says Up next only for the up-next task', () => {
    const upcoming = task({ status: 'not_started', priority: 2 });

    expect(taskMetaLine(upcoming, true)).toBe('Up next');
    expect(taskMetaLine(upcoming, false)).toBe('Not started');
  });

  it('says Start here on a roadmap where nothing has begun', () => {
    const upcoming = task({ status: 'not_started', priority: 2 });

    expect(taskMetaLine(upcoming, true, { neverStarted: true })).toBe('Start here');
  });

  it('prefers Up next over step progress on the up-next milestone', () => {
    const upcoming = task({ status: 'not_started', priority: 2, steps: [step(), step({ id: '2' })] });

    expect(taskMetaLine(upcoming, true, { neverStarted: false })).toBe('Up next');
    expect(taskMetaLine(upcoming, true)).toBe('Up next');
  });

  it('never says Start here on a milestone that is not up next', () => {
    const later = task({ status: 'not_started', priority: 2 });

    expect(taskMetaLine(later, false, { neverStarted: true })).toBe('Not started');
  });

  it('falls back to the status when the task has no steps', () => {
    expect(taskMetaLine(task({ status: 'in_progress', priority: 1 }), false)).toBe('In progress');
  });
});

describe('sortMilestones', () => {
  const a = task({ id: 'a', priority: 1, targetDate: '2026-03-01T00:00:00.000Z' });
  const b = task({ id: 'b', priority: 3, targetDate: '2026-01-01T00:00:00.000Z' });
  const c = task({ id: 'c', priority: 2 });

  it('leaves the roadmap order untouched', () => {
    const tasks = [a, b, c];

    expect(sortMilestones(tasks, 'roadmap')).toBe(tasks);
  });

  it('puts the highest priority first', () => {
    expect(sortMilestones([a, b, c], 'priority').map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts the earliest due date first, undated last', () => {
    expect(sortMilestones([a, b, c], 'dueDate').map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
  });

  it('sinks done milestones to the bottom of a derived view', () => {
    const done = task({ id: 'done', priority: 3, status: 'done' });

    expect(sortMilestones([done, a], 'priority').map((entry) => entry.id)).toEqual(['a', 'done']);
    expect(sortMilestones([done, a], 'dueDate').map((entry) => entry.id)).toEqual(['a', 'done']);
  });

  it('keeps done milestones in place in roadmap order', () => {
    const done = task({ id: 'done', status: 'done' });

    expect(sortMilestones([done, a], 'roadmap').map((entry) => entry.id)).toEqual(['done', 'a']);
  });

  it('falls back to roadmap order for ties', () => {
    const first = task({ id: 'first', priority: 2 });
    const second = task({ id: 'second', priority: 2 });

    expect(sortMilestones([first, second], 'priority').map((entry) => entry.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('ignores an unparseable date rather than ranking on it', () => {
    const broken = task({ id: 'broken', targetDate: 'not a date' });

    expect(sortMilestones([broken, b], 'dueDate').map((entry) => entry.id)).toEqual(['b', 'broken']);
  });

  it('never drops or duplicates a milestone', () => {
    const tasks = [a, b, c];

    for (const sort of ['roadmap', 'priority', 'dueDate'] as const) {
      expect([...sortMilestones(tasks, sort)].map((entry) => entry.id).sort()).toEqual([
        'a',
        'b',
        'c',
      ]);
    }
  });
});
