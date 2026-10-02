import { describe, expect, it } from 'vitest';

import type { CvEntry, RoadmapTask, Target } from '../types';
import { formatExportText } from './exportText';

const formatDate = (iso: string): string => iso.slice(0, 10);

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

const target = (overrides: Partial<Target> = {}): Target => ({
  id: 'target-1',
  roleId: 'software-engineer',
  level: 'internship',
  experience: 'Two class projects.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  focusTaskIds: [],
  roadmap: [task()],
  ...overrides,
});

const entry = (overrides: Partial<CvEntry> = {}): CvEntry => ({
  id: 'entry-1',
  targetId: 'target-1',
  taskId: 'task-1',
  status: 'ready',
  text: 'Built 1 portfolio project.',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

describe('formatExportText', () => {
  it('leads with the role, level and progress', () => {
    const text = formatExportText(
      target({ roadmap: [task({ status: 'done' }), task({ id: 'b' })] }),
      [],
      formatDate,
    );

    expect(text).toContain('Software Engineer — Internship');
    expect(text).toContain('Progress: 1 of 2 milestones done');
  });

  it('includes the employer and target date when set', () => {
    const text = formatExportText(
      target({ employer: 'Example Corp', targetDate: '2027-05-01T00:00:00.000Z' }),
      [],
      formatDate,
    );

    expect(text).toContain('Target company: Example Corp');
    expect(text).toContain('Ready by: 2027-05-01');
  });

  it('omits lines for fields that are not set', () => {
    const text = formatExportText(target(), [], formatDate);

    expect(text).not.toContain('Target company');
    expect(text).not.toContain('Ready by');
  });

  it('lists each milestone with its status, priority and steps', () => {
    const text = formatExportText(
      target({
        roadmap: [
          task({
            status: 'in_progress',
            priority: 3,
            steps: [
              { id: 's1', title: 'One', done: true },
              { id: 's2', title: 'Two', done: false },
            ],
          }),
        ],
      }),
      [],
      formatDate,
    );

    expect(text).toContain('- Build 1 portfolio project (In progress, High priority, 1/2 steps)');
  });

  it('includes only finished bullets for this target', () => {
    const text = formatExportText(target(), [
      entry({ id: '1', text: 'Built 1 thing.' }),
      entry({ id: '2', status: 'pending', text: '' }),
      entry({ id: '3', status: 'failed', text: '' }),
      entry({ id: '4', targetId: 'other', text: 'Another target.' }),
    ], formatDate);

    expect(text).toContain('• Built 1 thing.');
    expect(text).not.toContain('Another target.');
    expect(text.match(/•/gu)).toHaveLength(1);
  });

  it('says so plainly when there is nothing yet', () => {
    const text = formatExportText(target({ roadmap: [] }), [], formatDate);

    expect(text).toContain('- None yet');
    expect(text).toContain('• None yet');
  });

  it('ends with a single attribution line', () => {
    expect(formatExportText(target(), [], formatDate).endsWith('Exported from Maven.')).toBe(true);
  });
});
