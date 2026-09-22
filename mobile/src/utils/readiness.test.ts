import { describe, expect, it } from 'vitest';

import type { RoadmapTask } from '../types';
import { calculateReadiness } from './readiness';

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: 'Project is deployed and linked from the CV',
  steps: [],
  priority: 1,
  status: 'not_started',
  ...overrides,
});

describe('calculateReadiness', () => {
  it('returns zero for an empty roadmap', () => {
    expect(calculateReadiness([])).toBe(0);
  });

  it('uses done priority over total priority', () => {
    expect(
      calculateReadiness([
        task({ id: 'done', priority: 1, status: 'done' }),
        task({ id: 'active', priority: 3, status: 'in_progress' }),
      ]),
    ).toBe(25);
  });

  it('rounds to the nearest whole percent', () => {
    expect(
      calculateReadiness([
        task({ id: 'done', priority: 1, status: 'done' }),
        task({ id: 'not-started', priority: 2, status: 'not_started' }),
      ]),
    ).toBe(33);
  });

  it('returns 100 when every task is done', () => {
    expect(
      calculateReadiness([
        task({ id: 'a', priority: 2, status: 'done' }),
        task({ id: 'b', priority: 1, status: 'done' }),
      ]),
    ).toBe(100);
  });
});
