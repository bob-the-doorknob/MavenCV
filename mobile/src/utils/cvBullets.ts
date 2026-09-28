import type { CvEntry } from '../types';

/** What the backend writes where the user still owes a number. */
export const NUMBER_PLACEHOLDER = '[X]';

export interface BulletSegment {
  text: string;
  isPlaceholder: boolean;
}

export const needsNumber = (text: string): boolean => text.includes(NUMBER_PLACEHOLDER);

/**
 * Replaces every placeholder with the user's number. A blank value leaves the
 * bullet alone — an empty bullet is worse than one that still asks.
 */
export const fillNumberPlaceholder = (text: string, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return text;
  }
  return text.split(NUMBER_PLACEHOLDER).join(trimmed);
};

/** Splits a bullet so the placeholder can be highlighted inline. */
export const splitOnPlaceholder = (text: string): BulletSegment[] =>
  text
    .split(NUMBER_PLACEHOLDER)
    .flatMap((part, index) =>
      index === 0
        ? [{ text: part, isPlaceholder: false }]
        : [{ text: NUMBER_PLACEHOLDER, isPlaceholder: true }, { text: part, isPlaceholder: false }],
    )
    .filter((segment) => segment.text.length > 0);

/** Every ready bullet as plain text, one per line, bulleted. */
export const formatBulletsForCopy = (entries: readonly CvEntry[]): string =>
  entries
    .filter((entry) => entry.status === 'ready' && entry.text.trim().length > 0)
    .map((entry) => `• ${entry.text.trim()}`)
    .join('\n');

const PAST_TENSE: Readonly<Record<string, string>> = {
  analyze: 'Analyzed',
  build: 'Built',
  complete: 'Completed',
  create: 'Created',
  deploy: 'Deployed',
  design: 'Designed',
  develop: 'Developed',
  implement: 'Implemented',
  launch: 'Launched',
  practice: 'Practiced',
  publish: 'Published',
  ship: 'Shipped',
  solve: 'Solved',
  test: 'Tested',
  train: 'Trained',
  write: 'Wrote',
};

/** Demo bullets only rephrase evidence the student already entered. */
export const formatMockCvBullet = (taskTitle: string, notes: string): string => {
  const evidence = notes.trim().replace(/\s+/gu, ' ');
  const source = evidence.split(' ').length >= 5
    ? evidence.replace(/^I\s+/iu, '')
    : taskTitle.trim().replace(/\s+/gu, ' ');
  if (!source) return '';
  const withPastTense = source.replace(/^([A-Za-z]+)\b/u, (verb) => PAST_TENSE[verb.toLowerCase()] ?? verb);
  const capitalized = withPastTense.charAt(0).toUpperCase() + withPastTense.slice(1);
  return `${capitalized.replace(/[.!?]+$/u, '')}.`;
};

/** Matches the old demo template, including a number filled into [X]. */
export const legacyMockCvNumber = (text: string): string | null => {
  // The milestone and notes may have changed since the old draft was saved.
  // Match only the distinctive sentence templates produced by mock mode.
  if (/^Completed .+, as shown by: .+\.$/u.test(text)) return '';
  const match = /^Completed .+ by ([^,]{1,40}), based on: .+\.$/u.exec(text);
  return match?.[1] ?? null;
};
