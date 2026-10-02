import { describe, expect, it } from 'vitest';

import { markDoneState } from './markDone';

describe('markDoneState', () => {
  it('is ready with notes on an unfinished milestone', () => {
    expect(markDoneState('in_progress', 'Shipped it.', false)).toBe('ready');
    expect(markDoneState('not_started', 'Shipped it.', false)).toBe('ready');
  });

  it('notices a milestone finished on another device, whatever the notes say', () => {
    expect(markDoneState('done', 'My notes', false)).toBe('completed_elsewhere');
    expect(markDoneState('done', '', true)).toBe('completed_elsewhere');
  });

  it('notices a milestone that no longer exists', () => {
    expect(markDoneState(undefined, 'My notes', false)).toBe('missing');
  });

  it('blocks on a full vault before asking for notes', () => {
    expect(markDoneState('in_progress', '', true)).toBe('full');
  });

  it('needs notes that are more than whitespace', () => {
    expect(markDoneState('in_progress', '   ', false)).toBe('empty');
  });
});
