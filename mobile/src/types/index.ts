import type { Level } from '../data/roles';

export type TaskStatus = 'not_started' | 'in_progress' | 'done';
export type TaskPriority = 1 | 2 | 3;

/** A sub-step of a task. Steps are guidance only — they never move the readiness score. */
export interface TaskStep {
  id: string;
  title: string;
  done: boolean;
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
}

export type SchedulePace = 'comfortable' | 'ambitious';

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
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
