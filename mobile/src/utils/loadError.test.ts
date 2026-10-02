import { describe, expect, it } from 'vitest';

import { START_FRESH_NOTE, STILL_UNREADABLE, loadErrorActions, retryLabel, showStillUnreadable } from './loadError';

describe('loadErrorActions', () => {
  it('leads with Export, and steps Retry back, for data that cannot be read', () => {
    expect(loadErrorActions('permanent')).toEqual([
      { action: 'export', style: 'primary' },
      { action: 'retry', style: 'secondary' },
      { action: 'startFresh', style: 'ghost' },
    ]);
  });

  it.each(['transient', 'storage_full'] as const)('keeps Retry primary, and first, for a %s failure', (failure) => {
    expect(loadErrorActions(failure)).toEqual([
      { action: 'retry', style: 'primary' },
      { action: 'export', style: 'secondary' },
      { action: 'startFresh', style: 'ghost' },
    ]);
  });

  it('keeps Start fresh last and quiet either way, and offers all three', () => {
    for (const failure of ['permanent', 'transient', 'storage_full', null] as const) {
      const actions = loadErrorActions(failure);
      expect(actions.map((spec) => spec.action).sort()).toEqual(['export', 'retry', 'startFresh']);
      expect(actions[2]).toEqual({ action: 'startFresh', style: 'ghost' });
    }
  });

  it('treats an unknown failure like a transient one', () => {
    expect(loadErrorActions(null)[0]).toEqual({ action: 'retry', style: 'primary' });
  });
});

describe('retry feedback', () => {
  it('says Checking… while it re-reads', () => {
    expect(retryLabel(true)).toBe('Checking…');
    expect(retryLabel(false)).toBe('Retry loading saved data');
  });

  it('says the retry ran and failed — but only after it finished, and only while there is an error', () => {
    const failed = { retried: true, checking: false, error: 'x' };
    expect(showStillUnreadable(failed)).toBe(true);
    expect(showStillUnreadable({ ...failed, checking: true })).toBe(false);
    expect(showStillUnreadable({ ...failed, retried: false })).toBe(false);
    expect(showStillUnreadable({ ...failed, error: null })).toBe(false);
  });

  it('uses the wording the screen promises', () => {
    expect(STILL_UNREADABLE).toBe("Still can't read your saved data.");
    expect(START_FRESH_NOTE).toBe('Clears the data on this phone and sets a copy aside.');
  });
});
