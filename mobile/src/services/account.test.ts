import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
vi.mock('./appCheck', () => ({ getAppCheckToken: async () => 'test-app-check-token' }));
vi.mock('expo-secure-store', () => {
  const secure = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => secure.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      secure.delete(key);
    },
  };
});
vi.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: async (key: string) => {
        memory.delete(key);
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAppStore, useStorageStatus } from '../store/useAppStore';
import { localCopyKeys } from './localData';
import {
  AccountCommitFailed,
  AccountDeletionFailed,
  cancelConflict,
  configureAccount,
  deleteAccount,
  hasPendingConflict,
  linkGoogle,
  resetAccountForTests,
  resolveConflict,
  signOutLinkedAccount,
} from './account';
import { getLinkedAccount, getSignedInUid, setLinkedAccount } from './accountState';
import { ApiError, type SyncHttpResult, type SyncMethod, type SyncRequestOptions } from './api';
import { createMockGoogleProvider, unavailableGoogleProvider } from './googleCredential';
import { MockAuthBackend } from './mockAuthBackend';
import { signOutAndClear } from './signOut';
import { startConflictPrompt, type PromptSpec } from '../utils/conflictPrompt';
import { configureSync, onForeground, resetSyncForTests, syncNow } from './sync';
import { isLinkedAccount } from './syncAccount';
import { MockSyncServer } from './syncMockServer';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');

let backend: MockAuthBackend;
let servers: Map<string, MockSyncServer>;
let google: ReturnType<typeof createMockGoogleProvider>;
let calls: SyncMethod[];
let failDelete: boolean;
/** When set, sync's responses (computed already, server state applied) wait for it — a request "in flight". */
let hold: Promise<void> | null;

const serverFor = (uid: string): MockSyncServer => {
  let server = servers.get(uid);
  if (!server) {
    server = new MockSyncServer(() => NOW);
    servers.set(uid, server);
  }
  return server;
};

/** The sync transport, keyed by account the way the real backend keys it. */
const transport = async (method: SyncMethod, body?: unknown, options: SyncRequestOptions = {}): Promise<SyncHttpResult> => {
  calls.push(method);
  const uid = backend.uidForToken(options.idToken ?? (await backend.currentIdToken()));
  if (!uid) throw new ApiError('auth', 'Authentication is required', 'AUTHENTICATION_REQUIRED');
  if (method === 'DELETE') {
    if (failDelete) throw new ApiError('server', 'Internal error', 'INTERNAL_ERROR');
    serverFor(uid).delete();
    backend.deleteUser(uid);
    return { kind: 'ok', body: {} };
  }
  const response = method === 'GET' ? serverFor(uid).get() : serverFor(uid).put(JSON.stringify(body));
  if (response.status === 200) return { kind: 'ok', body: response.body };
  if (response.status === 409) return { kind: 'conflict', body: response.body };
  throw new ApiError('server', 'unexpected');
};

const addTarget = (experience = 'x'): string =>
  useAppStore.getState().addTarget({ roleId: 'software-engineer', level: 'internship', experience });

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

/** A second phone: its own fresh anonymous session and empty storage. */
const switchToNewDevice = async (): Promise<void> => {
  await backend.clearSession();
  await setLinkedAccount(null);
  useAppStore.getState().resetAll();
};

const cloudOf = (uid: string) => serverFor(uid).get().body as { targets: Array<{ id: string; deletedAt?: string }> };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('__DEV__', true);
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'true');
  resetSyncForTests();
  resetAccountForTests();
  useAppStore.getState().resetAll();
  useStorageStatus.setState({ ready: true, error: null });
  backend = new MockAuthBackend();
  servers = new Map();
  google = createMockGoogleProvider({ sub: 'g-123', email: 'student@example.com' });
  calls = [];
  failDelete = false;
  configureAccount({ provider: () => google, backend, request: transport });
  hold = null;
  configureSync({
    request: async (method, body) => {
      const response = await transport(method, body);
      if (hold) await hold;
      return response;
    },
    isLinked: isLinkedAccount,
  });
  return setLinkedAccount(null);
});

afterEach(() => {
  resetSyncForTests();
  resetAccountForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('linking', () => {
  it('links Google to the anonymous user, keeping its UID, then syncs through onAccountLinked', async () => {
    const anonymousUid = backend.uidForToken(await backend.currentIdToken());
    const targetId = addTarget();

    await expect(linkGoogle()).resolves.toEqual({ kind: 'linked' });
    await settle();

    expect(getLinkedAccount()).toMatchObject({ uid: anonymousUid, email: 'student@example.com', needsReauth: false });
    expect(getSignedInUid()).toBe(anonymousUid);
    expect(useAppStore.getState().sync.ownerUid).toBe(anonymousUid);
    expect(isLinkedAccount()).toBe(true);
    // The first pull and push went through the existing sync module.
    expect(calls).toEqual(['GET', 'PUT']);
    expect(cloudOf(anonymousUid as string).targets.map((target) => target.id)).toEqual([targetId]);
  });

  it('says sign-in is unavailable, and touches nothing, when the build has no provider', async () => {
    configureAccount({ provider: () => unavailableGoogleProvider, backend, request: transport });

    await expect(linkGoogle()).resolves.toEqual({ kind: 'unavailable' });
    expect(calls).toEqual([]);
    expect(isLinkedAccount()).toBe(false);
  });

  it('does nothing when the user backs out of the picker', async () => {
    configureAccount({ provider: () => createMockGoogleProvider({ cancel: true }), backend, request: transport });
    await expect(linkGoogle()).resolves.toEqual({ kind: 'cancelled' });
    expect(getLinkedAccount()).toBeNull();
  });
});

/** Device A links and syncs, so the Google account has a cloud copy. */
const seedCloudFromDeviceA = async (): Promise<{ uid: string; targetId: string }> => {
  const targetId = addTarget('from device A');
  await linkGoogle();
  await settle();
  return { uid: getSignedInUid() as string, targetId };
};

describe('a Google account already linked to a different UID', () => {
  it('restores the cloud copy on a new device', async () => {
    const { uid, targetId } = await seedCloudFromDeviceA();
    await switchToNewDevice();

    await expect(linkGoogle()).resolves.toEqual({ kind: 'restored' });
    await settle();

    expect(getSignedInUid()).toBe(uid);
    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([targetId]);
    expect(useAppStore.getState().activeTargetId).toBe(targetId);
  });

  it('asks with counts when the device has its own data, and keeps both until the user chooses', async () => {
    await seedCloudFromDeviceA();
    await switchToNewDevice();
    const localId = addTarget('made on device B');
    addTarget('also on B');

    const result = await linkGoogle();

    expect(result).toEqual({ kind: 'conflict', cloud: { roadmaps: 1, bullets: 0 }, device: { roadmaps: 2, bullets: 0 } });
    // Undecided: nothing linked, nothing deleted on either side.
    expect(isLinkedAccount()).toBe(false);
    expect(useAppStore.getState().targets.map((target) => target.id)).toContain(localId);
  });

  it('outcome "cloud": clears this device and restores the account copy', async () => {
    const { uid, targetId } = await seedCloudFromDeviceA();
    await switchToNewDevice();
    addTarget('made on device B');
    await linkGoogle();

    await resolveConflict('cloud');
    await settle();

    expect(getSignedInUid()).toBe(uid);
    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([targetId]);
    expect(cloudOf(uid).targets.filter((target) => !target.deletedAt).map((target) => target.id)).toEqual([targetId]);
  });

  it('outcome "device": replaces the account copy with this device data', async () => {
    const { uid, targetId } = await seedCloudFromDeviceA();
    await switchToNewDevice();
    const localId = addTarget('made on device B');
    await linkGoogle();

    await resolveConflict('device');
    await settle();

    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([localId]);
    const cloud = cloudOf(uid).targets;
    expect(cloud.filter((target) => !target.deletedAt).map((target) => target.id)).toEqual([localId]);
    expect(cloud.find((target) => target.id === targetId)).toHaveProperty('deletedAt');
  });

  it('outcome "identical": links without asking', async () => {
    const { uid } = await seedCloudFromDeviceA();
    const sameData = { targets: useAppStore.getState().targets, cvEntries: useAppStore.getState().cvEntries };
    await switchToNewDevice();
    useAppStore.setState(sameData);

    await expect(linkGoogle()).resolves.toEqual({ kind: 'linked' });
    expect(getSignedInUid()).toBe(uid);
  });

  it('leaves everything as it was when the user cancels the choice', async () => {
    await seedCloudFromDeviceA();
    await switchToNewDevice();
    const anonymousUid = backend.uidForToken(await backend.currentIdToken());
    addTarget('made on device B');
    await linkGoogle();
    const before = useAppStore.getState().targets;

    await cancelConflict();

    expect(useAppStore.getState().targets).toBe(before);
    expect(getLinkedAccount()).toBeNull();
    expect(backend.uidForToken(await backend.currentIdToken())).toBe(anonymousUid);
  });
});

describe('signing out and back in', () => {
  it('restores everything after sign out and clear', async () => {
    const { uid, targetId } = await seedCloudFromDeviceA();

    await expect(signOutAndClear()).resolves.toBe('cleared');
    expect(useAppStore.getState().targets).toEqual([]);
    expect(isLinkedAccount()).toBe(false);
    expect(google.signedIn()).toBe(false);

    await expect(linkGoogle()).resolves.toEqual({ kind: 'restored' });
    await settle();
    expect(getSignedInUid()).toBe(uid);
    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([targetId]);
  });

  it('drops the device session on sign out, so the next request is a fresh anonymous user', async () => {
    const { uid } = await seedCloudFromDeviceA();
    await signOutLinkedAccount();
    expect(backend.uidForToken(await backend.currentIdToken())).not.toBe(uid);
  });

  it('re-attaches without a prompt when the session had expired on this same device', async () => {
    const { uid } = await seedCloudFromDeviceA();
    addTarget('edited while signed out');
    // The refresh token was refused: account kept, sync paused, anonymous session in use.
    await setLinkedAccount({ ...(getLinkedAccount() as NonNullable<ReturnType<typeof getLinkedAccount>>), needsReauth: true });
    await backend.clearSession();
    expect(isLinkedAccount()).toBe(false);

    await expect(linkGoogle()).resolves.toEqual({ kind: 'linked' });
    await settle();

    expect(getSignedInUid()).toBe(uid);
    expect(cloudOf(uid).targets).toHaveLength(2);
  });
});

describe('deleting the account', () => {
  it('fails loudly and keeps everything when the server call fails', async () => {
    const { uid, targetId } = await seedCloudFromDeviceA();
    failDelete = true;

    await expect(deleteAccount()).rejects.toBeInstanceOf(AccountDeletionFailed);

    expect(getSignedInUid()).toBe(uid);
    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([targetId]);
    expect(backend.isDeleted(uid)).toBe(false);
    expect(isLinkedAccount()).toBe(true);
  });

  it('deletes the server data, revokes the Firebase session, and clears this device', async () => {
    const { uid } = await seedCloudFromDeviceA();
    const oldToken = await backend.currentIdToken();

    await deleteAccount();

    // Revoked: the old token no longer identifies anyone, on any device.
    expect(backend.isDeleted(uid)).toBe(true);
    expect(backend.uidForToken(oldToken)).toBeNull();
    // And dropped here: the next request starts a brand-new anonymous user.
    expect(backend.uidForToken(await backend.currentIdToken())).not.toBe(uid);
    expect(getLinkedAccount()).toBeNull();
    expect(useAppStore.getState().targets).toEqual([]);
    expect(serverFor(uid).get().body).toMatchObject({ serverUpdatedAt: null });
  });

  it('refuses without a linked account', async () => {
    await expect(deleteAccount()).rejects.toBeInstanceOf(AccountDeletionFailed);
    expect(calls).toEqual([]);
  });
});

describe('the dev simulate switch next to the real check', () => {
  it('is ignored in a production build, while a real linked account still counts', async () => {
    await seedCloudFromDeviceA();
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');

    expect(isLinkedAccount()).toBe(true);
    await setLinkedAccount(null);
    expect(isLinkedAccount()).toBe(false);
  });
});

describe('leaving the conflict prompt', () => {
  /** The prompt as Settings wires it, with the real account functions behind it. */
  const openPrompt = (cloud: { roadmaps: number; bullets: number }, device: { roadmaps: number; bullets: number }) => {
    const shown: PromptSpec[] = [];
    startConflictPrompt(cloud, device, {
      cancel: () => void cancelConflict(),
      resolve: (choice) => void resolveConflict(choice),
      show: (spec) => shown.push(spec),
    });
    return { current: (): PromptSpec => shown[shown.length - 1] as PromptSpec };
  };

  const conflictOnDeviceB = async () => {
    await seedCloudFromDeviceA();
    await switchToNewDevice();
    addTarget('made on device B');
    const anonymousUid = backend.uidForToken(await backend.currentIdToken());
    const result = await linkGoogle();
    if (result.kind !== 'conflict') throw new Error('expected a conflict');
    return { result, anonymousUid, before: useAppStore.getState().targets };
  };

  it.each([
    ['Cancel', (prompt: ReturnType<typeof openPrompt>) => prompt.current().buttons.find((b) => b.text === 'Cancel')?.onPress()],
    ['an outside tap or Back', (prompt: ReturnType<typeof openPrompt>) => prompt.current().options.onDismiss()],
  ])('leaves the device untouched when the user leaves with %s', async (_label, exit) => {
    const { result, anonymousUid, before } = await conflictOnDeviceB();
    const prompt = openPrompt(result.cloud, result.device);
    expect(hasPendingConflict()).toBe(true);
    const requestsBefore = calls.length;

    exit(prompt);
    await settle();

    expect(hasPendingConflict()).toBe(false);
    expect(useAppStore.getState().targets).toBe(before);
    expect(useAppStore.getState().sync.ownerUid).toBeNull();
    expect(getLinkedAccount()).toBeNull();
    expect(isLinkedAccount()).toBe(false);
    // Still the device's own anonymous user; the account's session was never adopted.
    expect(backend.uidForToken(await backend.currentIdToken())).toBe(anonymousUid);
    // Cancelling sends nothing: no push, no delete, no pull.
    expect(calls).toHaveLength(requestsBefore);
  });

  it('leaves the device untouched when the user backs out of the second step', async () => {
    const { result, before } = await conflictOnDeviceB();
    const prompt = openPrompt(result.cloud, result.device);
    prompt.current().buttons.find((b) => b.text === "Keep account's")?.onPress();

    prompt.current().options.onDismiss();
    await settle();

    expect(hasPendingConflict()).toBe(false);
    expect(useAppStore.getState().targets).toBe(before);
    expect(getLinkedAccount()).toBeNull();
  });
});

describe('responses that arrive after the device was cleared', () => {
  const holdResponses = (): (() => void) => {
    let release: () => void = () => {};
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  };

  it('a pull in flight when the account is deleted does not refill the device', async () => {
    await seedCloudFromDeviceA();
    const release = holdResponses();
    onForeground();
    await settle();
    expect(calls.at(-1)).toBe('GET');

    hold = null;
    await deleteAccount();
    release();
    await settle();

    expect(useAppStore.getState().targets).toEqual([]);
    expect(useAppStore.getState().sync.baseServerUpdatedAt).toBeNull();
    expect(getLinkedAccount()).toBeNull();
  });

  it('a push in flight when the user signs out does not write back', async () => {
    await seedCloudFromDeviceA();
    addTarget('edited just before signing out');
    const release = holdResponses();
    void syncNow({ pull: false });
    await settle();
    expect(calls.at(-1)).toBe('PUT');

    await expect(signOutAndClear({ force: true })).resolves.toBe('cleared');
    release();
    await settle();

    const { targets, sync } = useAppStore.getState();
    expect(targets).toEqual([]);
    expect(sync).toMatchObject({ baseServerUpdatedAt: null, ownerUid: null, lastSyncedAt: null });
    expect(isLinkedAccount()).toBe(false);
  });
});

describe('every wipe path deletes the local copies', () => {
  const seedCopies = async () => {
    for (const key of localCopyKeys()) await AsyncStorage.setItem(key, 'old copy');
  };
  const remaining = async () =>
    (await Promise.all(localCopyKeys().map((key) => AsyncStorage.getItem(key)))).filter((value) => value !== null);

  it('Sign out and clear this device', async () => {
    await seedCloudFromDeviceA();
    await seedCopies();
    await expect(signOutAndClear()).resolves.toBe('cleared');
    expect(await remaining()).toEqual([]);
  });

  it('Delete account', async () => {
    await seedCloudFromDeviceA();
    await seedCopies();
    await deleteAccount();
    expect(await remaining()).toEqual([]);
  });

  it('keeps them when Delete account fails, as it keeps everything else', async () => {
    await seedCloudFromDeviceA();
    await seedCopies();
    failDelete = true;
    await expect(deleteAccount()).rejects.toBeInstanceOf(AccountDeletionFailed);
    expect(await remaining()).toHaveLength(localCopyKeys().length);
  });

  it('Sign out and clear for an unlinked device (the plain reset)', async () => {
    addTarget();
    await seedCopies();
    await expect(signOutAndClear()).resolves.toBe('cleared');
    expect(await remaining()).toEqual([]);
  });
});

describe('sign-out while a sync is already running', () => {
  it('waits for that sync and its queued push, instead of reporting unsynced changes', async () => {
    const { uid } = await seedCloudFromDeviceA();
    let release: () => void = () => {};
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    onForeground(); // a pull is now in flight
    await settle();
    hold = null;
    const targetId = addTarget('made just before signing out');

    const signingOut = signOutAndClear();
    release();
    await settle();

    await expect(signingOut).resolves.toBe('cleared');
    // The new milestone reached the account before the device was cleared.
    expect(cloudOf(uid).targets.map((target) => target.id)).toContain(targetId);
    expect(useAppStore.getState().targets).toEqual([]);
  });
});

describe('a link whose commit fails leaves the device as it was', () => {
  it('rolls back when the session cannot be adopted', async () => {
    const anonymousUid = backend.uidForToken(await backend.currentIdToken());
    const targetId = addTarget();
    const failingBackend = Object.create(backend) as MockAuthBackend;
    failingBackend.adoptSession = async () => {
      throw new Error('SecureStore write failed');
    };
    failingBackend.currentIdToken = () => backend.currentIdToken();
    failingBackend.signInWithGoogle = (token, link) => backend.signInWithGoogle(token, link);
    configureAccount({ provider: () => google, backend: failingBackend, request: transport });

    await expect(linkGoogle()).rejects.toBeInstanceOf(AccountCommitFailed);

    expect(getLinkedAccount()).toBeNull();
    expect(useAppStore.getState().sync.ownerUid).toBeNull();
    expect(isLinkedAccount()).toBe(false);
    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([targetId]);
    expect(backend.uidForToken(await backend.currentIdToken())).toBe(anonymousUid);
    expect(calls).toEqual([]);
  });

  it('keeps both copies, and the choice open, when a conflict commit fails', async () => {
    await seedCloudFromDeviceA();
    await switchToNewDevice();
    const localId = addTarget('made on device B');
    await linkGoogle();
    const failingBackend = Object.create(backend) as MockAuthBackend;
    failingBackend.adoptSession = async () => {
      throw new Error('SecureStore write failed');
    };
    configureAccount({ provider: () => google, backend: failingBackend, request: transport });

    await expect(resolveConflict('cloud')).rejects.toBeInstanceOf(AccountCommitFailed);

    // "Keep account's" would have cleared this phone; the failure must not have.
    expect(useAppStore.getState().targets.map((target) => target.id)).toEqual([localId]);
    expect(getLinkedAccount()).toBeNull();
    expect(hasPendingConflict()).toBe(true);
  });
});
