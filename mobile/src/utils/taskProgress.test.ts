import { describe, expect, it } from 'vitest';

import { advanceTask } from './taskProgress';

describe('offline task progress', () => {
  it('cycles through task states and timestamps completed work', () => {
    const start = { id: 'one', title: 'Build 1 report', weight: 100, status: 'not_started' as const };
    const inProgress = advanceTask(start, '2026-09-22T00:00:00.000Z');
    expect(inProgress.status).toBe('in_progress');
    const done = advanceTask(inProgress, '2026-09-22T00:00:00.000Z');
    expect(done).toMatchObject({ status: 'done', completedAt: '2026-09-22T00:00:00.000Z' });
    expect(advanceTask(done, '2026-09-23T00:00:00.000Z')).toEqual(start);
  });
});
