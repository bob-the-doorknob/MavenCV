import { create } from 'zustand';

import { useAppStore } from '../store/useAppStore';
import { getLinkedAccount } from './accountState';

/**
 * Who may sync. Sync needs an account that exists beyond this install: an
 * anonymous Firebase uid belongs to one install, so a snapshot stored under
 * it could never be reached from a second device, and the backend refuses
 * such accounts (docs/sync-contract.md §1, SYNC_ACCOUNT_REQUIRED). Only a
 * Google-linked account syncs; linking itself lives in account.ts.
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
  if (canSimulateLinkedAccount() && useSyncDevAccount.getState().simulateLinked) {
    return true;
  }
  // The real check: a Google-linked account whose session is healthy, and
  // local data that belongs to that same account.
  const account = getLinkedAccount();
  return account !== null && !account.needsReauth && useAppStore.getState().sync.ownerUid === account.uid;
};

