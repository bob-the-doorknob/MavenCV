import { describe, expect, it } from 'vitest';

import { syncStatusCopy } from './syncStatusCopy';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('syncStatusCopy', () => {
  it('says sync is off without a linked account, whatever the status', () => {
    expect(syncStatusCopy('error', false, null, NOW).title).toBe('Sync is off');
  });

  it('gives a wrong device date its own message', () => {
    expect(syncStatusCopy('clock_skew', true, null, NOW).title).toBe('Check your device date');
    expect(syncStatusCopy('error', true, null, NOW).title).not.toBe('Check your device date');
  });

  it.each([
    [10_000, 'Synced just now'],
    [5 * 60_000, 'Synced 5 min ago'],
    [3 * 60 * 60_000, 'Synced 3 h ago'],
    [3 * 24 * 60 * 60_000, 'Synced on 29 Sep'],
  ])('describes a sync %i ms ago as "%s"', (elapsed, text) => {
    expect(syncStatusCopy('idle', true, ago(elapsed), NOW).subtitle).toBe(text);
  });

  it('reassures that local data is safe on failure', () => {
    expect(syncStatusCopy('error', true, null, NOW).subtitle).toContain('safe');
    expect(syncStatusCopy('offline', true, null, NOW).subtitle).toContain('saved here');
  });

  it('tells the user to update the app for data from a newer version', () => {
    const copy = syncStatusCopy('update_required', true, null, NOW);
    expect(copy.title).toBe('Update Maven to keep syncing');
    expect(copy.subtitle).toContain('Update the app');
    expect(copy.subtitle).toContain('safe');
  });

  it('tells the user what to delete when the data is over the limits', () => {
    const copy = syncStatusCopy('too_large', true, null, NOW);
    expect(copy.title).toBe('Too much data to sync');
    expect(copy.subtitle).toContain('Delete');
  });

  it('over the count limits: says what to delete and that the phone is safe, word for word', () => {
    const copy = syncStatusCopy('over_limit', true, null, NOW);
    expect(copy.title).toBe('Too much to sync');
    expect(copy.subtitle).toBe(
      'Delete roadmaps or CV bullets you no longer need, then tap to retry. Everything on this phone is safe.',
    );
  });

  it('keeps the over-limit and too-large copy distinct', () => {
    expect(syncStatusCopy('over_limit', true, null, NOW)).not.toEqual(syncStatusCopy('too_large', true, null, NOW));
  });
});
