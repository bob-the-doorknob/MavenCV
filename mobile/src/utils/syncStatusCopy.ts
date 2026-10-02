import type { SyncStatus } from '../services/sync';
import { formatDueDate } from './targetDate';

export interface SyncStatusCopy {
  title: string;
  subtitle: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const syncedAgo = (lastSyncedAt: string | null, now: number): string => {
  if (!lastSyncedAt) return 'Not synced yet';
  const elapsed = now - Date.parse(lastSyncedAt);
  if (Number.isNaN(elapsed) || elapsed < MINUTE) return 'Synced just now';
  if (elapsed < HOUR) return `Synced ${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < 24 * HOUR) return `Synced ${Math.floor(elapsed / HOUR)} h ago`;
  return `Synced on ${formatDueDate(lastSyncedAt)}`;
};

/**
 * What the Settings sync row says. Every state tells the user their data on
 * this phone is safe, because that is the question a sync problem raises.
 */
export const syncStatusCopy = (
  status: SyncStatus,
  linked: boolean,
  lastSyncedAt: string | null,
  now: number,
): SyncStatusCopy => {
  if (!linked) {
    return {
      title: 'Sync is off',
      subtitle: 'Sync needs a linked account. Everything stays saved on this device.',
    };
  }
  switch (status) {
    case 'syncing':
      return { title: 'Syncing', subtitle: syncedAgo(lastSyncedAt, now) };
    case 'offline':
      return { title: 'Offline', subtitle: 'Changes are saved here and sync when you are back online.' };
    case 'update_required':
      return {
        title: 'Update Maven to keep syncing',
        subtitle:
          "Your account's data was saved by a newer version of Maven. Update the app, then it will sync again. Everything on this phone is safe.",
      };
    case 'too_large':
      return {
        title: 'Too much data to sync',
        subtitle:
          "Your data is over what Maven can keep in sync. Delete milestones, bullets or targets you no longer need. Everything on this phone is safe.",
      };
    case 'error':
      return { title: 'Sync paused', subtitle: 'Something went wrong. Your data on this device is safe. Tap to retry.' };
    case 'clock_skew':
      return {
        title: 'Check your device date',
        subtitle: "Your phone's date looks wrong, so sync is paused. Fix the date, then tap to retry.",
      };
    case 'idle':
      return { title: 'Sync is on', subtitle: syncedAgo(lastSyncedAt, now) };
  }
};
