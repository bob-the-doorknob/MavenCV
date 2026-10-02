import { useAppStore } from '../store/useAppStore';
import { signOutLinkedAccount } from './account';
import { resetThisDevice } from './localData';
import { syncNow } from './sync';
import { isLinkedAccount } from './syncAccount';

export type SignOutResult = 'cleared' | 'unsynced';

/**
 * "Sign out and clear this device", for a linked account. A plain local wipe
 * would be undone by the next pull, so this signs out first and then clears
 * the phone. The account's copy is kept; deleting it is Delete account's job.
 *
 * Changes made here that have not reached the account yet would be lost, so
 * it pushes them first through the normal sync path. If they still cannot be
 * sent (offline, say) it clears nothing and reports 'unsynced', unless the
 * user has chosen to sign out anyway (`force`).
 */
export const signOutAndClear = async ({ force = false }: { force?: boolean } = {}): Promise<SignOutResult> => {
  if (!isLinkedAccount()) {
    // Nothing to sign out of; the caller should have offered the plain reset.
    await resetThisDevice();
    return 'cleared';
  }

  // The user is leaving: an undo still on offer would hold the push back.
  if (useAppStore.getState().pendingUndo) useAppStore.getState().clearPendingUndo();
  if (!force) {
    // Waits for any sync already running and the push queued behind it, so
    // the warning below only appears when changes really did not get through.
    if (useAppStore.getState().sync.dirty) await syncNow({ pull: false });
    if (useAppStore.getState().sync.dirty) return 'unsynced';
  }
  // Forced ("Sign out anyway"): the user accepted losing unsent changes, so
  // nothing waits on the network. A response still in flight is discarded
  // by the account epoch.

  // Unlinks in memory synchronously, before the wipe; the rest is awaited.
  const signedOut = signOutLinkedAccount();
  await resetThisDevice();
  await signedOut;
  // Not linked any more, so this makes no request; it only resets the status shown.
  void syncNow({ pull: false });
  return 'cleared';
};
