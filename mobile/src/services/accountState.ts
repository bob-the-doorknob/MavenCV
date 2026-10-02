import { create } from 'zustand';

import { bumpEpoch } from '../store/accountEpoch';

/**
 * The linked account, if any — the identity that sync and Purchases care
 * about. Separate from the Firebase *session*: a device always holds some
 * session (anonymous until linked), but only a linked account syncs.
 *
 * Kept in SecureStore, not AsyncStorage: it holds the user's email.
 * In memory it is a plain store so `isLinkedAccount()` can answer
 * synchronously and offline.
 */
export interface LinkedAccount {
  uid: string;
  provider: 'google.com';
  email?: string;
  /**
   * The linked session's refresh token was refused (expired, revoked, user
   * disabled). Sync pauses until the user signs in again; nothing local is
   * touched.
   */
  needsReauth: boolean;
}

const STORAGE_KEY = 'maven-linked-account-v1';

export const useAccountState = create<{ account: LinkedAccount | null; loaded: boolean }>(() => ({
  account: null,
  loaded: false,
}));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parse = (raw: string | null): LinkedAccount | null => {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.uid !== 'string' || !value.uid || value.provider !== 'google.com') return null;
  return {
    uid: value.uid,
    provider: 'google.com',
    ...(typeof value.email === 'string' ? { email: value.email } : {}),
    needsReauth: value.needsReauth === true,
  };
};

// Imported lazily so modules that only read the in-memory state stay
// loadable where the native module is not (tests, node).
const secureStore = () => import('expo-secure-store');

const persist = async (account: LinkedAccount | null): Promise<void> => {
  const store = await secureStore();
  if (account) await store.setItemAsync(STORAGE_KEY, JSON.stringify(account));
  else await store.deleteItemAsync(STORAGE_KEY);
};

/** Reads the saved account once at startup. Sync stays off until this resolves. */
export const loadAccountState = async (): Promise<void> => {
  try {
    const store = await secureStore();
    useAccountState.setState({ account: parse(await store.getItemAsync(STORAGE_KEY)), loaded: true });
  } catch {
    // Unreadable means "not linked": the safe answer is to not sync.
    useAccountState.setState({ account: null, loaded: true });
  }
};

/** Updates memory first, so anything checking "linked?" sees it at once. */
export const setLinkedAccount = async (account: LinkedAccount | null): Promise<void> => {
  // Whose data this device holds just changed; in-flight work for the old state is stale.
  bumpEpoch();
  useAccountState.setState({ account, loaded: true });
  await persist(account);
};

export const getLinkedAccount = (): LinkedAccount | null => useAccountState.getState().account;

/** Called by the session layer when a linked session's refresh is refused. */
export const markNeedsReauth = async (): Promise<void> => {
  const account = getLinkedAccount();
  if (!account || account.needsReauth) return;
  await setLinkedAccount({ ...account, needsReauth: true });
};

/**
 * The Firebase UID of the signed-in (linked, healthy) account, or null.
 * The one place Purchases.logIn(uid) should read from. Anonymous sessions
 * deliberately return null: their UID is per-install and would scatter one
 * person's purchases across throwaway identities.
 */
export const getSignedInUid = (): string | null => {
  const account = getLinkedAccount();
  return account && !account.needsReauth ? account.uid : null;
};
