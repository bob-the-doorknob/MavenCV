import { resolveRoleTitle } from '../data/roles';
import { useAppStore } from '../store/useAppStore';
import { ApiError, generateCvBullet } from './api';
import { create } from 'zustand';

// Module-level lock: only one run at a time. A call while running is ignored.
let isRunning = false;
let screenActive = true;
export const setCvQueueActive = (active: boolean): void => { screenActive = active; };
export const useCvQueueStatus = create<{ running: boolean; message: string | null }>(() => ({ running: false, message: null }));

/**
 * Processes every pending CV entry, one at a time, turning each into
 * 'ready' or 'failed'. Never awaited by a caller that needs the UI to stay
 * responsive — callers fire it with `void processPendingCvEntries()`.
 *
 * On a rate-limited response, the whole run stops immediately and every
 * remaining entry (including the one that was rate-limited) stays pending,
 * to be picked up by a later trigger instead of hammering the backend.
 */
export const processPendingCvEntries = async (): Promise<void> => {
  if (isRunning) {
    return;
  }
  isRunning = true;
  useCvQueueStatus.setState({ running: true, message: null });

  try {
    while (screenActive) {
      const { targets, cvEntries } = useAppStore.getState();
      const entry = cvEntries.find((candidate) => candidate.status === 'pending');
      if (!entry) break;
      const target = targets.find((candidate) => candidate.id === entry.targetId);
      const task = target?.roadmap.find((candidate) => candidate.id === entry.taskId);

      try {
        const result = await generateCvBullet({
          taskTitle: task?.title ?? '',
          notes: task?.notes ?? '',
          ...(target ? { roleTitle: resolveRoleTitle(target.roleId, target.customTitle), level: target.level } : {}),
        });
        useAppStore.getState().updateCvEntry(entry.id, {
          status: 'ready',
          text: result.text,
          ...(result.suggestions ? { suggestions: result.suggestions } : {}),
        });
      } catch (error) {
        if (error instanceof ApiError && (error.kind === 'rate_limited' || error.kind === 'network' || error.kind === 'auth')) {
          useCvQueueStatus.setState({ message: error.kind === 'rate_limited' ? 'AI capacity is limited. Wait before pulling to retry.' : 'CV generation paused. Check your connection, then pull to retry.' });
          return;
        }
        useAppStore.getState().updateCvEntry(entry.id, { status: 'failed' });
      }
    }
  } finally {
    isRunning = false;
    useCvQueueStatus.setState({ running: false });
  }
};

/** Explicit retry for one failed entry: puts it back to pending, then runs the queue. */
export const retryCvEntry = (id: string): void => {
  const entry = useAppStore.getState().cvEntries.find((candidate) => candidate.id === id);
  if (!entry || entry.status !== 'failed') {
    return;
  }
  useAppStore.getState().updateCvEntry(id, { status: 'pending' });
  void processPendingCvEntries();
};
