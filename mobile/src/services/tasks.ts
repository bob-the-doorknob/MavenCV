import { useAppStore } from '../store/useAppStore';
import { processPendingCvEntries } from './cvQueue';

/**
 * Screens completing a task must call this, not the store's completeTask
 * directly — it also fires the CV-bullet queue (fire-and-forget, never
 * awaited, never blocks the UI).
 */
export const completeTaskAndQueue = (taskId: string, notes: string): void => {
  useAppStore.getState().completeTask(taskId, notes);
  void processPendingCvEntries();
};
