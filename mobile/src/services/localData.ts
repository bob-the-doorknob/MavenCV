import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LEGACY_BACKUP_KEY,
  PRE_MIGRATION_KEY_PREFIX,
  RECOVERY_KEY,
  STORAGE_KEY,
  STORE_VERSION,
  migrate,
  stampChanges,
  useAppStore,
  useStorageStatus,
} from '../store/useAppStore';
import { generateTestData } from '../utils/testData';
import { isLinkedAccount } from './syncAccount';

/**
 * Everything about this device's saved data that is not the live store: the
 * pre-migration copies, the "Start fresh" recovery copy, and the wipes that
 * must take them along. None of these copies is ever read by sync — sync only
 * sees the live store — so they never leave the device.
 */

/** Every key a local copy can live under. Pre-migration copies exist only for versions older than this build's. */
export const localCopyKeys = (): string[] => [
  RECOVERY_KEY,
  LEGACY_BACKUP_KEY,
  ...Array.from({ length: STORE_VERSION }, (_, version) => `${PRE_MIGRATION_KEY_PREFIX}${version}`),
];

/** Removes every local copy. Part of every wipe: data the user deleted must not linger in a backup. */
export const deleteLocalCopies = async (): Promise<void> => {
  await Promise.all(localCopyKeys().map((key) => AsyncStorage.removeItem(key)));
};


/** "Reset all data", and the local half of sign-out and account deletion. */
export const resetThisDevice = async (): Promise<void> => {
  useAppStore.getState().resetAll();
  await deleteLocalCopies();
};

/** The saved data exactly as stored, for "Export raw data" when it cannot be loaded. */
export const readRawData = (): Promise<string | null> => AsyncStorage.getItem(STORAGE_KEY);

/**
 * "Start fresh" after the saved data could not be loaded. The raw data is
 * set aside first — and verified — so support can still recover it; only
 * then is the live store cleared and reloaded empty.
 */
export const startFresh = async (): Promise<void> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    await AsyncStorage.setItem(RECOVERY_KEY, raw);
    if ((await AsyncStorage.getItem(RECOVERY_KEY)) !== raw) {
      throw new Error('Could not set aside the saved data. Nothing was cleared.');
    }
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  // Every copy stays — the recovery copy just written, and any pre-migration
  // copy, which may be the last readable version of the user's data. Only a
  // deliberate wipe (Reset, Sign out and clear, Delete account) removes them.
  useAppStore.getState().resetAll();
  await useAppStore.persist.rehydrate();
};

/** Long enough to see "Checking…" — a read that fails in a few ms would otherwise look like nothing happened. */
export const MIN_CHECK_MS = 600;

/**
 * Retry on the could-not-load screen. Never writes: it only reads the saved
 * data again. While it runs `checking` is true; if the data still cannot be
 * read, `retried` is true afterwards so the screen can say the retry ran.
 */
export const retryLoadingSavedData = async ({ minMs = MIN_CHECK_MS }: { minMs?: number } = {}): Promise<void> => {
  if (useStorageStatus.getState().checking) return;
  useStorageStatus.setState({ checking: true, retried: false });
  try {
    await Promise.all([useAppStore.persist.rehydrate(), new Promise((resolve) => setTimeout(resolve, minMs))]);
  } finally {
    useStorageStatus.setState({ checking: false, retried: useStorageStatus.getState().error !== null });
  }
};

/** Development builds only. Release builds never show the corruption row and never run it. */
export const devCorruptionAvailable = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Dev tool: overwrites the saved data with invalid JSON, to reach the
 * "could not be loaded" screen on demand. Touches only the main store key —
 * the recovery and pre-migration copies are left exactly as they are, so the
 * recovery paths can be tried against a real failure. The caller reloads the
 * app afterwards. Refuses to run outside a development build.
 */
export const corruptSavedData = async (): Promise<void> => {
  if (!devCorruptionAvailable()) throw new Error('Corrupting saved data is only available in development builds.');
  await AsyncStorage.setItem(STORAGE_KEY, '{"state": corrupted on purpose by the dev tool');
};

/** The "Load test data (dev)" row: the same guard as the corruption tool. */
export const devTestDataAvailable = (): boolean => devCorruptionAvailable();

/**
 * Dev tool: replaces the live data with generated data (utils/testData.ts).
 * It goes through the same path as a real change: the generated records are
 * run through load-time normalisation (`migrate`), then `stampChanges` — so
 * they get monotonic `updatedAt` stamps, the replaced records leave
 * tombstones, and the change is marked dirty — and the result is written by
 * the store's own persistence. It never writes a storage key itself, and
 * never touches the recovery or pre-migration copies.
 *
 * Refused for a linked account: syncing would push 500 test bullets into the
 * real account and tombstone its data everywhere.
 */
export const loadTestData = (now: number = Date.now()): void => {
  if (!devTestDataAvailable()) throw new Error('Test data is only available in development builds.');
  if (isLinkedAccount()) throw new Error('Sign out before loading test data; it would sync into your account.');
  const generated = generateTestData(now, now.toString(36));
  const normalised = migrate({
    targets: generated.targets,
    activeTargetId: generated.targets[0]?.id ?? null,
    cvEntries: generated.cvEntries,
  });
  const store = useAppStore.getState();
  if (store.pendingUndo) store.clearPendingUndo();
  const patch = stampChanges(
    useAppStore.getState(),
    {
      targets: normalised.targets,
      cvEntries: normalised.cvEntries,
      activeTargetId: normalised.activeTargetId,
      onboardingDraft: null,
    },
    now,
  );
  useAppStore.setState(patch);
};

/** What "Export" shares when a save failed: the in-memory data that did not reach storage. */
export const currentDataAsText = (): string => {
  const { targets, activeTargetId, cvEntries, onboardingDraft, tombstones, sync } = useAppStore.getState();
  return JSON.stringify({ targets, activeTargetId, cvEntries, onboardingDraft, tombstones, sync });
};

/** Saves the current state again after a failed write. */
export const retryWrite = (): void => {
  useAppStore.setState({});
};
