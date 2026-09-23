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
