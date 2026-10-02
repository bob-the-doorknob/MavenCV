import { create } from 'zustand';

/**
 * Who may sync. Sync needs an account that exists beyond this install:
 * Maven signs everyone in anonymously today, and an anonymous Firebase uid
 * belongs to one install, so a snapshot stored under it could never be
 * reached from a second device. The backend refuses such accounts
 * (docs/sync-contract.md §1, SYNC_ACCOUNT_REQUIRED).
 *
 * Until account linking ships, a real build therefore never syncs, and never
 * makes a sync request. This file is the seam linking will replace.
 */

const isDevBuild = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;
const isMockMode = (): boolean => process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';

/**
 * The simulate switch may only exist in a development build talking to the
 * in-memory mock server. Anywhere else it is inert: it can be set, but
 * nothing reads it.
 */
export const canSimulateLinkedAccount = (): boolean => isDevBuild() && isMockMode();

/** Not persisted: a dev convenience, and the mock server forgets on reload anyway. */
export const useSyncDevAccount = create<{ simulateLinked: boolean }>(() => ({ simulateLinked: false }));

export const setSimulateLinkedAccount = (on: boolean): void => {
  if (!canSimulateLinkedAccount()) return;
  useSyncDevAccount.setState({ simulateLinked: on });
};

/**
 * Synchronous and offline by design: answering "may I sync?" must never
 * itself reach the network.
 */
export const isLinkedAccount = (): boolean => {
  if (canSimulateLinkedAccount()) {
    return useSyncDevAccount.getState().simulateLinked;
  }
  // Replace with the real check (a non-anonymous Firebase provider) when
  // account linking is built.
  return false;
};
