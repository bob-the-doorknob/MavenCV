import { useAppStore } from '../store/useAppStore';

/**
 * Completes and queues locally. The CV screen owns network processing;
 * this checklist action never starts an AI request.
 */
export const completeTaskAndQueue = (taskId: string, notes: string): void => {
  useAppStore.getState().completeTask(taskId, notes);
};
