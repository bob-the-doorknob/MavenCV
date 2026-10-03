import type { TaskStatus } from '../types';

/**
 * What screen readers say for things the eye reads from shape, colour or
 * symbols: the score arc, milestone rows, progress bars and stats. Plain
 * words only — "47 percent", "2 of 4 steps" — never "47%", "2/4" or "~".
 */

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const STATUS_WORDS: Readonly<Record<TaskStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

/** "47 percent ready for internships, 3 of 7 milestones done". */
export const spokenScore = (value: number, readyFor: string, done?: number, total?: number): string => {
  const percent = Math.round(Math.min(100, Math.max(0, value)));
  const base = `${percent} percent ${readyFor}`;
  return done === undefined || total === undefined ? base : `${base}, ${done} of ${plural(total, 'milestone')} done`;
};

/**
 * Rewrites the symbols in short meta and schedule strings into words:
 * "2/4 steps" → "2 of 4 steps", "~3 weeks" → "about 3 weeks".
 */
export const spokenMeta = (text: string): string =>
  text.replace(/(\d+)\/(\d+)/gu, '$1 of $2').replace(/~\s*(\d)/gu, 'about $1');

export interface SpokenMilestone {
  title: string;
  status: TaskStatus;
  meta?: string | undefined;
  schedule?: { text: string; tone: 'none' | 'on_track' | 'due_soon' | 'overdue' } | undefined;
  isCurrent?: boolean;
}

/**
 * A milestone row as one sentence: title, status, then whatever the row
 * shows beneath it. Overdue and due soon are said in words, because on
 * screen they are partly carried by colour.
 */
export const spokenMilestone = ({ title, status, meta, schedule, isCurrent }: SpokenMilestone): string => {
  const parts = [title.trim(), STATUS_WORDS[status]];
  if (isCurrent && status !== 'done') parts.push('Current milestone');
  // A done row shows no meta (DESIGN.md §5); its speech matches.
  if (status !== 'done') {
    if (meta && meta !== STATUS_WORDS[status]) parts.push(spokenMeta(meta));
    if (schedule) {
      const when = spokenMeta(schedule.text);
      parts.push(schedule.tone === 'overdue' ? `Overdue, ${when.replace(/^Was due/u, 'was due')}` : schedule.tone === 'due_soon' ? `Due soon, ${when.replace(/^Due/u, 'due')}` : when);
    }
  }
  return parts.join('. ');
};

/** What a reorderable row tells a screen-reader user about moving it. */
export const REORDER_HINT = 'Opens the milestone. To reorder, use the Move up and Move down actions.';

/** The order after moving one id by one place, for the Move up / Move down actions. Pure. */
export const moveId = (ids: readonly string[], id: string, offset: -1 | 1): string[] => {
  const from = ids.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
};

/** "2 of 4 steps done" for a progress bar. */
export const spokenSteps = (done: number, total: number): string => `${done} of ${plural(total, 'step')} done`;

/** A stat tile read as one phrase: "3 milestones", "2 week streak", "47 percent ready". */
export const spokenStat = (value: string, label: string): string =>
  `${value.replace(/(\d+)%/u, '$1 percent')} ${label.toLowerCase()}`;
