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

import { useAppStore, useStorageStatus } from '../store/useAppStore';
import {
  AccountDeletionFailed,
  cancelConflict,
  configureAccount,
  deleteAccount,
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
import { configureSync, resetSyncForTests } from './sync';
import { isLinkedAccount } from './syncAccount';
import { MockSyncServer } from './syncMockServer';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');

let backend: MockAuthBackend;
let servers: Map<string, MockSyncServer>;
let google: ReturnType<typeof createMockGoogleProvider>;
let calls: SyncMethod[];
let failDelete: boolean;

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
  configureSync({ request: (method, body) => transport(method, body), isLinked: isLinkedAccount });
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
