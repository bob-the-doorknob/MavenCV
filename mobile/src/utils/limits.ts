/**
 * Limits the sync contract enforces (docs/sync-contract.md §5). The client
 * stops short of them with a friendly message, because over them sync would
 * stop for good and the user would not know why.
 */
export const MAX_MILESTONES_PER_TARGET = 200;
export const MAX_TARGETS = 50;
export const MAX_CV_ENTRIES = 2_000;

export type LimitKind = 'milestones' | 'targets' | 'cvEntries';

const LIMITS: Readonly<Record<LimitKind, number>> = {
  milestones: MAX_MILESTONES_PER_TARGET,
  targets: MAX_TARGETS,
  cvEntries: MAX_CV_ENTRIES,
};

/** True when one more would go over the limit. */
export const atLimit = (kind: LimitKind, currentCount: number): boolean => currentCount >= LIMITS[kind];

export const limitMessage = (kind: LimitKind): string => {
  switch (kind) {
    case 'milestones':
      return `This roadmap has reached ${MAX_MILESTONES_PER_TARGET} milestones, the most Maven can keep in sync. Delete some you no longer need to add more.`;
    case 'targets':
      return `You have ${MAX_TARGETS} target roles, the most Maven can keep in sync. Delete one you no longer need to add another.`;
    case 'cvEntries':
      return `You have 2,000 CV bullets, the most Maven can keep in sync. Delete some you no longer need to finish more milestones.`;
  }
};
