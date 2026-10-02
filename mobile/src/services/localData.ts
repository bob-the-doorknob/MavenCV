import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LEGACY_BACKUP_KEY,
  PRE_MIGRATION_KEY_PREFIX,
  RECOVERY_KEY,
  STORAGE_KEY,
  STORE_VERSION,
  useAppStore,
} from '../store/useAppStore';

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

/** What "Export" shares when a save failed: the in-memory data that did not reach storage. */
export const currentDataAsText = (): string => {
  const { targets, activeTargetId, cvEntries, onboardingDraft, tombstones, sync } = useAppStore.getState();
  return JSON.stringify({ targets, activeTargetId, cvEntries, onboardingDraft, tombstones, sync });
};

/** Saves the current state again after a failed write. */
export const retryWrite = (): void => {
  useAppStore.setState({});
};
