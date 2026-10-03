import { describe, expect, it } from 'vitest';

import type { RoadmapTask } from '../types';
import { scheduleLabel } from './schedule';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const fmt = (iso: string): string => iso.slice(0, 10);
const task = (overrides: Partial<RoadmapTask>): RoadmapTask => ({
  id: 't', title: 'T', doneWhen: '', steps: [], estimatedWeeks: 2, priority: 2, status: 'not_started', ...overrides,
});

describe('scheduleLabel', () => {
  it('says overdue in words, so the meaning never rides on colour alone', () => {
    const label = scheduleLabel(task({ targetDate: '2026-09-01T00:00:00.000Z' }), NOW, fmt);
    expect(label).toEqual({ text: 'Was due 2026-09-01', status: 'overdue' });
  });

  it('keeps "Due" for work still ahead', () => {
    expect(scheduleLabel(task({ targetDate: '2026-12-01T00:00:00.000Z' }), NOW, fmt)?.text).toBe('Due 2026-12-01');
  });

  it('shows nothing for done work', () => {
    expect(scheduleLabel(task({ status: 'done', targetDate: '2026-09-01T00:00:00.000Z' }), NOW, fmt)).toBeNull();
  });
});
