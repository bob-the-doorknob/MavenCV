export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface RoadmapTask {
  id: string;
  title: string;
  weight: number;
  status: TaskStatus;
  notes?: string;
  completedAt?: string;
}

export interface TargetRole {
  id: string;
  title: string;
  employer?: string;
  tasks: RoadmapTask[];
  createdAt: string;
}

export interface CvEntry {
  id: string;
  targetRoleId: string;
  sourceTaskId: string;
  text: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
