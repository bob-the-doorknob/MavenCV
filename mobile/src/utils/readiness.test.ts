import { describe, expect, it } from 'vitest';

import type { RoadmapTask } from '../types';
import { calculateReadiness } from './readiness';

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  weight: 1,
  status: 'not_started',
  ...overrides,
});

describe('calculateReadiness', () => {
  it('returns zero for an empty roadmap', () => {
    expect(calculateReadiness([])).toBe(0);
  });

  it('uses completed weight over total positive weight', () => {
    expect(
      calculateReadiness([
        task({ id: 'done', weight: 1, status: 'done' }),
        task({ id: 'active', weight: 3, status: 'in_progress' }),
      ]),
    ).toBe(25);
  });

  it('ignores non-positive and non-finite weights', () => {
    expect(
      calculateReadiness([
        task({ id: 'valid', weight: 2, status: 'done' }),
        task({ id: 'zero', weight: 0, status: 'done' }),
        task({ id: 'invalid', weight: Number.NaN, status: 'done' }),
      ]),
    ).toBe(100);
  });
});
