import { describe, expect, it } from 'vitest';

import type { CvEntry } from '../types';
import {
  fillNumberPlaceholder,
  formatBulletsForCopy,
  formatMockCvBullet,
  legacyMockCvNumber,
  needsNumber,
  splitOnPlaceholder,
} from './cvBullets';

const entry = (overrides: Partial<CvEntry> = {}): CvEntry => ({
  id: 'entry-1',
  targetId: 'target-1',
  taskId: 'task-1',
  status: 'ready',
  text: 'Built 1 portfolio project.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('formatMockCvBullet', () => {
  it('uses meaningful completion notes without repeating the task title', () => {
    expect(formatMockCvBullet('Build 1 PDF chatbot', 'I built a PDF chatbot and tested 3 questions.'))
      .toBe('Built a PDF chatbot and tested 3 questions.');
  });

  it('falls back to the completed task title for vague notes', () => {
    expect(formatMockCvBullet('Build 1 PDF chatbot', 'I build.')).toBe('Built 1 PDF chatbot.');
  });

  it('does not fabricate a number', () => {
    expect(formatMockCvBullet('Create a portfolio', 'I created a portfolio showing my class projects.'))
      .toBe('Created a portfolio showing my class projects.');
  });
});

describe('legacyMockCvNumber', () => {
  it('matches untouched old demo output and a filled placeholder', () => {
    expect(legacyMockCvNumber('Completed Build 1 PDF chatbot, as shown by: I built 3 things.')).toBe('');
    expect(legacyMockCvNumber('Completed Build 1 PDF chatbot by 3, based on: I build.')).toBe('3');
    expect(legacyMockCvNumber('Built 1 PDF chatbot.')).toBe(null);
  });

  it('recognizes old template even after milestone notes change', () => {
    expect(legacyMockCvNumber('Completed Build one AI chatbot by 3, based on: I build.')).toBe('3');
    expect(legacyMockCvNumber('Completed 3 PDF chatbots for class.')).toBe(null);
  });
});

describe('needsNumber', () => {
  it('detects the placeholder', () => {
    expect(needsNumber('Handled [X] rows.')).toBe(true);
    expect(needsNumber('Handled 5,000 rows.')).toBe(false);
  });
});

describe('fillNumberPlaceholder', () => {
  it('replaces the placeholder with the value', () => {
    expect(fillNumberPlaceholder('Handled [X] rows.', '5,000')).toBe('Handled 5,000 rows.');
  });

  it('replaces every placeholder, not just the first', () => {
    expect(fillNumberPlaceholder('Tested [X] flows across [X] apps.', '3')).toBe(
      'Tested 3 flows across 3 apps.',
    );
  });

  it('trims the value', () => {
    expect(fillNumberPlaceholder('Handled [X] rows.', '  5k  ')).toBe('Handled 5k rows.');
  });

  it('leaves the bullet untouched for a blank value', () => {
    expect(fillNumberPlaceholder('Handled [X] rows.', '   ')).toBe('Handled [X] rows.');
    expect(fillNumberPlaceholder('Handled [X] rows.', '')).toBe('Handled [X] rows.');
  });

  it('leaves a bullet without a placeholder alone', () => {
    expect(fillNumberPlaceholder('Handled 5k rows.', '3')).toBe('Handled 5k rows.');
  });
});

describe('splitOnPlaceholder', () => {
  it('marks the placeholder segment', () => {
    expect(splitOnPlaceholder('Handled [X] rows.')).toEqual([
      { text: 'Handled ', isPlaceholder: false },
      { text: '[X]', isPlaceholder: true },
      { text: ' rows.', isPlaceholder: false },
    ]);
  });

  it('returns one segment when there is no placeholder', () => {
    expect(splitOnPlaceholder('Handled 5k rows.')).toEqual([
      { text: 'Handled 5k rows.', isPlaceholder: false },
    ]);
  });

  it('handles a bullet that starts with the placeholder', () => {
    expect(splitOnPlaceholder('[X] users tested it.')).toEqual([
      { text: '[X]', isPlaceholder: true },
      { text: ' users tested it.', isPlaceholder: false },
    ]);
  });
});

describe('formatBulletsForCopy', () => {
  it('bullets each ready entry on its own line', () => {
    const text = formatBulletsForCopy([
      entry({ id: '1', text: 'Built 1 portfolio project.' }),
      entry({ id: '2', text: 'Solved 50 algorithm problems.' }),
    ]);

    expect(text).toBe('• Built 1 portfolio project.\n• Solved 50 algorithm problems.');
  });

  it('skips pending and failed entries', () => {
    const text = formatBulletsForCopy([
      entry({ id: '1', status: 'pending', text: '' }),
      entry({ id: '2', status: 'failed', text: '' }),
      entry({ id: '3', text: 'Built 1 portfolio project.' }),
    ]);

    expect(text).toBe('• Built 1 portfolio project.');
  });

  it('skips a ready entry with only whitespace and trims the rest', () => {
    const text = formatBulletsForCopy([
      entry({ id: '1', text: '   ' }),
      entry({ id: '2', text: '  Built 1 thing.  ' }),
    ]);

    expect(text).toBe('• Built 1 thing.');
  });

  it('returns an empty string when nothing is ready', () => {
    expect(formatBulletsForCopy([])).toBe('');
    expect(formatBulletsForCopy([entry({ status: 'pending', text: '' })])).toBe('');
  });
});
