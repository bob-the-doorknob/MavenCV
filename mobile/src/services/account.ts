import { parseIncomingRecords, useAppStore } from '../store/useAppStore';
import { isTombstone, recordsEqual, stripForPush, toRecords, type SyncRecords } from '../utils/syncMerge';
import { getLinkedAccount, setLinkedAccount } from './accountState';
import { ApiError, requestSync, type SyncHttpResult, type SyncMethod, type SyncRequestOptions } from './api';
import {
  GoogleSignInCancelled,
  getGoogleProvider,
  type GoogleCredentialProvider,
} from './googleCredential';
import { IdentityError, restAuthBackend, type AuthBackend, type IdpSession } from './identityToolkit';
import { resetThisDevice } from './localData';
import { mockAuthBackend } from './mockAuthBackend';
import { onAccountLinked } from './sync';
import { useSyncDevAccount } from './syncAccount';

/**
 * Account linking, sign-out and deletion, built on three narrow seams:
 * a Google credential provider (the library we pick later), an auth backend
 * (Identity Toolkit REST, or its mock), and the sync transport. Sync itself
 * is never reimplemented here — linking ends with `onAccountLinked()`.
 */

export interface AccountDeps {
  provider: () => GoogleCredentialProvider;
  backend: AuthBackend;
  request: (method: SyncMethod, body?: unknown, options?: SyncRequestOptions) => Promise<SyncHttpResult>;
}

const isMockMode = (): boolean => process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';

const defaultDeps = (): AccountDeps => ({
  provider: getGoogleProvider,
  backend: isMockMode() ? mockAuthBackend : restAuthBackend,
  request: requestSync,
});

let override: Partial<AccountDeps> = {};
const deps = (): AccountDeps => ({ ...defaultDeps(), ...override });

/** Tests swap the provider, backend and transport. */
export const configureAccount = (overrides: Partial<AccountDeps>): void => {
  override = overrides;
};

export interface DataCounts {
  roadmaps: number;
  bullets: number;
}

export type LinkResult =
  | { kind: 'unavailable' }
  | { kind: 'cancelled' }
  /** Linked; this device's data now belongs to the account. */
  | { kind: 'linked' }
  /** Signed in to an existing account; its cloud copy is being restored. */
  | { kind: 'restored' }
  /** The account already has different data and so does this device: the user chooses. */
  | { kind: 'conflict'; cloud: DataCounts; device: DataCounts };

export type ConflictChoice = 'cloud' | 'device';

/**
 * Held in memory only while the user decides. Nothing about the other
 * account is persisted until they choose, so killing the app mid-choice
 * leaves the device exactly as it was: anonymous, data untouched.
 */
let pendingConflict: { session: IdpSession; cloud: SyncRecords; serverUpdatedAt: string | null } | null = null;

export const hasPendingConflict = (): boolean => pendingConflict !== null;

const liveCounts = (records: SyncRecords): DataCounts => ({
  roadmaps: records.targets.filter((record) => !isTombstone(record)).length,
  bullets: records.cvEntries.filter((record) => !isTombstone(record)).length,
});

const liveOnly = (records: SyncRecords): SyncRecords => ({
  targets: records.targets.filter((record) => !isTombstone(record)),
  cvEntries: records.cvEntries.filter((record) => !isTombstone(record)),
});

/** What this device would push, normalised the way the server copy is. */
const deviceRecords = (): SyncRecords => {
  const state = useAppStore.getState();
  const parsed = parseIncomingRecords(state.targets, state.cvEntries);
  return stripForPush(parsed ?? toRecords(state));
};

/** Commits to an account: its session becomes the device's, and sync starts. */
const commit = async (session: IdpSession): Promise<void> => {
  await deps().backend.adoptSession(session);
  await setLinkedAccount({
    uid: session.uid,
    provider: 'google.com',
    ...(session.email ? { email: session.email } : {}),
    needsReauth: false,
  });
  useAppStore.getState().setSyncMeta({ ownerUid: session.uid });
  onAccountLinked();
};

const readCloud = async (session: IdpSession): Promise<{ records: SyncRecords; serverUpdatedAt: string | null }> => {
  const result = await deps().request('GET', undefined, { idToken: session.idToken });
  const body = result.body as { targets?: unknown; cvEntries?: unknown; serverUpdatedAt?: unknown };
  const records =
    Array.isArray(body.targets) && Array.isArray(body.cvEntries)
      ? parseIncomingRecords(body.targets, body.cvEntries)
      : null;
  if (!records) throw new ApiError('invalid_response', 'Account copy was malformed.');
  return { records, serverUpdatedAt: typeof body.serverUpdatedAt === 'string' ? body.serverUpdatedAt : null };
};

/**
 * "Continue with Google". Links Google to this device's Firebase user so the
 * UID — and every record already keyed to it — stays the same. If that Google
 * account already belongs to another user, signs in to that one instead and
 * works out what to do with the two copies of the data.
 */
export const linkGoogle = async (): Promise<LinkResult> => {
  const { provider, backend } = deps();
  const google = provider();
  if (!google.isAvailable()) return { kind: 'unavailable' };

  let credential;
  try {
    credential = await google.signIn();
  } catch (error) {
    if (error instanceof GoogleSignInCancelled) return { kind: 'cancelled' };
    throw error;
  }

  try {
    const linked = await backend.signInWithGoogle(credential.idToken, await backend.currentIdToken());
    await commit(linked);
    return { kind: 'linked' };
  } catch (error) {
    if (!(error instanceof IdentityError) || error.code !== 'FEDERATED_USER_ID_ALREADY_LINKED') {
      await google.signOut().catch(() => {});
      throw error;
    }
  }

  // This Google account already has its own Firebase user.
  const existing = await backend.signInWithGoogle(credential.idToken);

  // Signing back in to the account this device's data already belongs to
  // (after a session expired): nothing to choose, sync merges as usual.
  if (useAppStore.getState().sync.ownerUid === existing.uid) {
    await commit(existing);
    return { kind: 'linked' };
  }

  const cloud = await readCloud(existing);
  const device = deviceRecords();
  const deviceLive = liveOnly(device);

  if (deviceLive.targets.length === 0 && deviceLive.cvEntries.length === 0) {
    // A new device, or one cleared by sign-out: just restore.
    useAppStore.getState().resetAll();
    await commit(existing);
    return { kind: 'restored' };
  }
  if (recordsEqual(deviceLive, liveOnly(cloud.records))) {
    await commit(existing);
    return { kind: 'linked' };
  }

  pendingConflict = { session: existing, cloud: cloud.records, serverUpdatedAt: cloud.serverUpdatedAt };
  return { kind: 'conflict', cloud: liveCounts(cloud.records), device: liveCounts(device) };
};

/**
 * Applies the user's confirmed choice. Only now is the losing side removed:
 * - 'cloud': this device's data is cleared and the account copy restored;
 * - 'device': the account copy is replaced by this device's data, by
 *   tombstoning every cloud record the device does not have and pushing.
 */
export const resolveConflict = async (choice: ConflictChoice): Promise<void> => {
  const conflict = pendingConflict;
  if (!conflict) throw new Error('No account conflict to resolve');
  pendingConflict = null;

  if (choice === 'cloud') {
    useAppStore.getState().resetAll();
  } else {
    useAppStore.getState().replaceAccountCopy(conflict.cloud, conflict.serverUpdatedAt);
  }
  await commit(conflict.session);
};

/** The user backed out: forget the other account; this device stays as it was. */
export const cancelConflict = async (): Promise<void> => {
  pendingConflict = null;
  await deps().provider().signOut().catch(() => {});
};

/**
 * Ends the linked session on this device. Memory is updated first, so sync
 * sees "not linked" at once; callers clear local data afterwards, never
 * before, so nothing can be pulled back in.
 */
export const signOutLinkedAccount = async (): Promise<void> => {
  useSyncDevAccount.setState({ simulateLinked: false });
  const wasLinked = getLinkedAccount() !== null;
  const cleared = setLinkedAccount(null);
  if (wasLinked) {
    await deps().provider().signOut().catch(() => {});
    await deps().backend.clearSession();
  }
  await cleared;
};

export class AccountDeletionFailed extends Error {
  public constructor(public readonly reason: unknown) {
    super('Account deletion did not complete');
    this.name = 'AccountDeletionFailed';
  }
}

/**
 * Deletes the account: the server removes the stored data and the Firebase
 * user, which revokes the session on every device. Only after it confirms
 * is anything here cleared. If the server call fails this throws and leaves
 * everything local exactly as it was — it never reports a deletion that did
 * not happen.
 */
export const deleteAccount = async (): Promise<void> => {
  if (!getLinkedAccount()) throw new AccountDeletionFailed(new Error('No linked account'));
  try {
    await deps().request('DELETE');
  } catch (error) {
    throw new AccountDeletionFailed(error);
  }

  // Server confirmed. Revoke here too: the server has already invalidated
  // the Firebase user, and this drops the dead tokens from the device.
  useSyncDevAccount.setState({ simulateLinked: false });
  await setLinkedAccount(null);
  await deps().provider().signOut().catch(() => {});
  await deps().backend.clearSession();
  if (useAppStore.getState().pendingUndo) useAppStore.getState().clearPendingUndo();
  await resetThisDevice();
};

/** Tests only. */
export const resetAccountForTests = (): void => {
  pendingConflict = null;
  override = {};
};
