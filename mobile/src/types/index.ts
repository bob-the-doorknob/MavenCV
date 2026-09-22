import type { Level } from '../data/roles';

export type TaskStatus = 'not_started' | 'in_progress' | 'done';
export type TaskPriority = 1 | 2 | 3;

export interface RoadmapTask {
  id: string;
  title: string;
  /** The verifiable condition that marks this task complete. */
  doneWhen: string;
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
}

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
