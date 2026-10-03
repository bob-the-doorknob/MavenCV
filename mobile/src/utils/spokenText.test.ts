import { describe, expect, it } from 'vitest';

import { REORDER_HINT, moveId, spokenMeta, spokenMilestone, spokenScore, spokenStat, spokenSteps } from './spokenText';

describe('spokenScore', () => {
  it('says the score in words, with the milestone count', () => {
    expect(spokenScore(47, 'ready for internships', 3, 7)).toBe('47 percent ready for internships, 3 of 7 milestones done');
  });
  it('rounds, clamps and pluralises', () => {
    expect(spokenScore(46.6, 'ready', 1, 1)).toBe('47 percent ready, 1 of 1 milestone done');
    expect(spokenScore(140, 'ready')).toBe('100 percent ready');
    expect(spokenScore(-3, 'ready')).toBe('0 percent ready');
  });
  it('never contains a percent sign', () => {
    expect(spokenScore(50, 'ready', 2, 4)).not.toContain('%');
  });
});

describe('spokenMeta', () => {
  it('turns symbols into words', () => {
    expect(spokenMeta('2/4 steps')).toBe('2 of 4 steps');
    expect(spokenMeta('~3 weeks')).toBe('about 3 weeks');
    expect(spokenMeta('Up next')).toBe('Up next');
  });
});

describe('spokenMilestone', () => {
  it('reads title, status, meta and schedule as a sentence', () => {
    expect(
      spokenMilestone({ title: 'Build 1 API', status: 'in_progress', meta: '2/4 steps', schedule: { text: 'Due 12 May', tone: 'on_track' } }),
    ).toBe('Build 1 API. In progress. 2 of 4 steps. Due 12 May');
  });
  it('says overdue and due soon in words, not just colour', () => {
    expect(spokenMilestone({ title: 'A', status: 'not_started', schedule: { text: 'Was due 1 May', tone: 'overdue' } })).toBe(
      'A. Not started. Overdue, was due 1 May',
    );
    expect(spokenMilestone({ title: 'A', status: 'in_progress', schedule: { text: 'Due 3 May', tone: 'due_soon' } })).toBe(
      'A. In progress. Due soon, due 3 May',
    );
  });
  it('marks the current milestone and skips a meta that repeats the status', () => {
    expect(spokenMilestone({ title: 'A', status: 'in_progress', meta: 'In progress', isCurrent: true })).toBe(
      'A. In progress. Current milestone',
    );
  });
  it('says only title and Done for a done row, like the screen', () => {
    expect(spokenMilestone({ title: 'A', status: 'done', meta: '4/4 steps', schedule: { text: 'Due 1 May', tone: 'overdue' }, isCurrent: true })).toBe(
      'A. Done',
    );
  });
  it('estimates in words', () => {
    expect(spokenMilestone({ title: 'A', status: 'not_started', meta: 'Up next', schedule: { text: '~3 weeks', tone: 'none' } })).toBe(
      'A. Not started. Up next. about 3 weeks',
    );
  });
});

describe('other phrases', () => {
  it('steps, stats and the reorder hint', () => {
    expect(spokenSteps(1, 3)).toBe('1 of 3 steps done');
    expect(spokenSteps(0, 1)).toBe('0 of 1 step done');
    expect(spokenStat('2', 'Week streak')).toBe('2 week streak');
    expect(spokenStat('47%', 'Ready')).toBe('47 percent ready');
    expect(REORDER_HINT).toMatch(/Move up and Move down/u);
  });
});

describe('moveId', () => {
  it('moves one place up or down, and nowhere past either end', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b'], 'missing', 1)).toEqual(['a', 'b']);
  });
});
