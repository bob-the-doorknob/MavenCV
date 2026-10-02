import { describe, expect, it } from 'vitest';

import { MAX_CV_ENTRIES, MAX_MILESTONES_PER_TARGET, MAX_TARGETS, atLimit, limitMessage, liveCountsAtOrOverLimit } from './limits';

describe('limits', () => {
  it('match the sync contract', () => {
    expect([MAX_MILESTONES_PER_TARGET, MAX_TARGETS, MAX_CV_ENTRIES]).toEqual([200, 50, 2_000]);
  });

  it('allow adding up to the limit and refuse one past it', () => {
    expect(atLimit('milestones', 199)).toBe(false);
    expect(atLimit('milestones', 200)).toBe(true);
    expect(atLimit('targets', 49)).toBe(false);
    expect(atLimit('targets', 50)).toBe(true);
    expect(atLimit('cvEntries', 1_999)).toBe(false);
    expect(atLimit('cvEntries', 2_000)).toBe(true);
  });

  it('explain what to do, with the number', () => {
    expect(limitMessage('milestones')).toContain('200');
    expect(limitMessage('targets')).toContain('50');
    expect(limitMessage('cvEntries')).toContain('2,000');
    for (const kind of ['milestones', 'targets', 'cvEntries'] as const) expect(limitMessage(kind)).toMatch(/Delete/);
  });
});

describe('liveCountsAtOrOverLimit', () => {
  const under = { targets: 3, cvEntries: 40, largestRoadmap: 9 };

  it('is false well under every limit', () => {
    expect(liveCountsAtOrOverLimit(under)).toBe(false);
  });

  it.each([
    ['targets', { ...under, targets: 50 }],
    ['CV entries', { ...under, cvEntries: 2_000 }],
    ['milestones in one roadmap', { ...under, largestRoadmap: 200 }],
  ])('is true at the %s limit', (_label, counts) => {
    expect(liveCountsAtOrOverLimit(counts)).toBe(true);
  });

  it('is false one under each limit', () => {
    expect(liveCountsAtOrOverLimit({ targets: 49, cvEntries: 1_999, largestRoadmap: 199 })).toBe(false);
  });
});

