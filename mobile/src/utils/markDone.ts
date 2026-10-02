import type { TaskStatus } from '../types';

/**
 * What the Mark-done sheet can do right now. The sheet only opens for an
 * unfinished milestone; if the milestone turns 'done' while it is open, it
 * was finished on another device (a sync pull landed). The sheet then stays
 * open with the user's notes intact and says so, rather than reporting a
 * success that did not happen and throwing the notes away.
 */
export type MarkDoneState = 'ready' | 'empty' | 'full' | 'completed_elsewhere' | 'missing';

export const markDoneState = (status: TaskStatus | undefined, notes: string, vaultFull: boolean): MarkDoneState => {
  if (status === undefined) return 'missing';
  if (status === 'done') return 'completed_elsewhere';
  if (vaultFull) return 'full';
  if (!notes.trim()) return 'empty';
  return 'ready';
};
