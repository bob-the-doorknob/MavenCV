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
});
