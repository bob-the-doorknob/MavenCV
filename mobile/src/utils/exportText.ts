import { levelLabels, resolveRoleTitle } from '../data/roles';
import type { CvEntry, Target } from '../types';
import { countSteps, priorityLabels } from './groupTasks';

const STATUS_LABELS = {
  done: 'Done',
  in_progress: 'In progress',
  not_started: 'Not started',
} as const;

/**
 * Everything the user has built, as plain text they can paste anywhere.
 * Deliberately not JSON: this is for a human reading it in an email, not for
 * re-importing.
 */
export const formatExportText = (
  target: Target,
  entries: readonly CvEntry[],
  formatDate: (iso: string) => string,
): string => {
  const roleTitle = resolveRoleTitle(target.roleId, target.customTitle);
  const done = target.roadmap.filter((task) => task.status === 'done').length;

  const header = [
    `${roleTitle} — ${levelLabels[target.level]}`,
    target.employer ? `Target company: ${target.employer}` : null,
    target.targetDate ? `Ready by: ${formatDate(target.targetDate)}` : null,
    `Progress: ${done} of ${target.roadmap.length} milestones done`,
  ].filter((line): line is string => line !== null);

  const milestones = target.roadmap.map((task) => {
    const steps = countSteps(task);
    const details = [
      STATUS_LABELS[task.status],
      `${priorityLabels[task.priority]} priority`,
      steps.total > 0 ? `${steps.done}/${steps.total} steps` : null,
      task.targetDate && task.status !== 'done' ? `due ${formatDate(task.targetDate)}` : null,
    ].filter((part): part is string => part !== null);

    return `- ${task.title} (${details.join(', ')})`;
  });

  // Only finished bullets: a pending one is an empty string, and a failed one
  // never got written.
  const bullets = entries
    .filter((entry) => entry.targetId === target.id && entry.status === 'ready' && entry.text.trim())
    .map((entry) => `• ${entry.text.trim()}`);

  const sections = [
    header.join('\n'),
    `MILESTONES\n${milestones.length > 0 ? milestones.join('\n') : '- None yet'}`,
    `CV BULLETS\n${bullets.length > 0 ? bullets.join('\n') : '• None yet'}`,
  ];

  return `${sections.join('\n\n')}\n\nExported from Maven.`;
};
