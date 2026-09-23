import { describe, expect, it } from 'vitest';

import type { RoadmapTask, TaskStep } from '../types';
import { countSteps, orderRoadmap, taskMetaLine } from './groupTasks';

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
  it('shows priority and Done for a completed task, without steps', () => {
    const done = task({ status: 'done', priority: 3, steps: [step({ done: true })] });

    expect(taskMetaLine(done, false)).toBe('High · Done');
  });

  it('shows step progress for an in-progress task', () => {
    const inProgress = task({
      status: 'in_progress',
      priority: 2,
      steps: [step({ id: '1', done: true }), step({ id: '2' })],
    });

    expect(taskMetaLine(inProgress, false)).toBe('Med · In progress · 1/2 steps');
  });

  it('says Up next only for the up-next task', () => {
    const upcoming = task({ status: 'not_started', priority: 2 });

    expect(taskMetaLine(upcoming, true)).toBe('Med · Up next');
    expect(taskMetaLine(upcoming, false)).toBe('Med · Not started');
  });

  it('omits steps when the task has none', () => {
    expect(taskMetaLine(task({ status: 'in_progress', priority: 1 }), false)).toBe('Low · In progress');
  });
});
