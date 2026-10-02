import type { Level } from '../data/roles';

export type TaskStatus = 'not_started' | 'in_progress' | 'done';
export type TaskPriority = 1 | 2 | 3;

/** A sub-step of a task. Steps are guidance only — they never move the readiness score. */
export interface TaskStep {
  id: string;
  title: string;
  done: boolean;
  /** When it was ticked. Absent on steps finished before streaks existed. */
  completedAt?: string;
}

/** What the user was part-way through when they last closed onboarding. */
export interface OnboardingDraft {
  step: 'role' | 'aboutYou' | 'readyBy';
  roleId: string | null;
  customTitle: string;
  level: Level | null;
  employer: string;
  experience: string;
  targetDate: string | null;
  savedAt: string;
}

export interface RoadmapTask {
  id: string;
  title: string;
  /** The verifiable condition that marks this task complete. */
  doneWhen: string;
  /** Why this task matters for the target role and level. */
  why?: string;
  /** Empty for tasks persisted before steps existed. */
  steps: TaskStep[];
  /** How long this milestone should take, 1-8 weeks. Defaults to 2. */
  estimatedWeeks: number;
  /** ISO date this milestone should be finished by, set by the scheduler. */
  targetDate?: string;
  /** True for milestones the user added themselves, rather than generated ones. */
  createdByUser?: boolean;
  priority: TaskPriority;
  /** Stable scoring weight; legacy tasks fall back to their original priority. */
  weight?: number;
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  notificationId?: string;
}

export interface Target {
  id: string;
  /** A RolePreset id from data/roles.ts, or CUSTOM_ROLE_ID. */
  roleId: string;
  /** Required when roleId is CUSTOM_ROLE_ID. */
  customTitle?: string;
  level: Level;
  employer?: string;
  experience: string;
  createdAt: string;
  roadmap: RoadmapTask[];
  /** At most 2 not-done task ids. Empty for targets persisted before focus existed. */
  focusTaskIds: string[];
  lastCheckInAt?: string;
  /** ISO date the user wants to be ready by. */
  targetDate?: string;
  schedulePace?: SchedulePace;
  /** Set the first time this target hit 100%, so the celebration fires once. */
  readyCelebratedAt?: string;
  /** View preference, remembered per target. Defaults to 'roadmap'. */
  milestoneSort?: MilestoneSort;
  /**
   * When anything in this target last changed, on this device's clock.
   * Stamped centrally by the store on every mutation; sync's last-write-wins
   * compares it. Data from before sync falls back to createdAt.
   */
  updatedAt: string;
}

export type SchedulePace = 'comfortable' | 'ambitious';

/** How the milestone list is ordered on screen. Never changes stored order. */
export type MilestoneSort = 'roadmap' | 'priority' | 'dueDate';

export type CvEntryStatus = 'pending' | 'ready' | 'failed';

export interface CvEntry {
  id: string;
  targetId: string;
  taskId: string;
  status: CvEntryStatus;
  /** Empty while status is 'pending'. */
  text: string;
  suggestions?: string[];
  createdAt: string;
  /** Last change, stamped by the store. Data from before sync falls back to createdAt. */
  updatedAt: string;
}

/**
 * What remains of a deleted target, so the delete reaches every device.
 * Terminal: a tombstone beats a live record with the same id whatever the
 * timestamps (docs/sync-contract.md §7).
 */
export interface TargetTombstone {
  id: string;
  updatedAt: string;
  deletedAt: string;
}

export interface CvEntryTombstone {
  id: string;
  targetId: string;
  updatedAt: string;
  deletedAt: string;
}

export interface Tombstones {
  targets: TargetTombstone[];
  cvEntries: CvEntryTombstone[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
