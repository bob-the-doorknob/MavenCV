import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import { IdentityError, parseSignInWithIdp, restAuthBackend, signInWithIdpBody } from './identityToolkit';

const NOW = 1_000_000;

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'public-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('signInWithIdp request', () => {
  it('links to the current user when given its ID token, so the UID is kept', () => {
    expect(signInWithIdpBody('google token&x', 'firebase-anon-token')).toEqual({
      postBody: 'id_token=google%20token%26x&providerId=google.com',
      requestUri: 'http://localhost',
      returnSecureToken: true,
      returnIdpCredential: true,
      idToken: 'firebase-anon-token',
    });
  });

  it('signs in to the existing user when no ID token is given', () => {
    expect(signInWithIdpBody('g')).not.toHaveProperty('idToken');
  });

  it('posts to signInWithIdp with the public API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ localId: 'uid-1', idToken: 'id', refreshToken: 'r', expiresIn: '3600', email: 'a@b.c' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restAuthBackend.signInWithGoogle('g', 'anon')).resolves.toMatchObject({ uid: 'uid-1', email: 'a@b.c' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=public-test-key');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toMatchObject({ idToken: 'anon' });
  });

  it('reports an unreachable Firebase as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(restAuthBackend.signInWithGoogle('g')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('signInWithIdp response', () => {
  it('parses a session', () => {
    expect(parseSignInWithIdp(true, { localId: 'u', idToken: 'i', refreshToken: 'r', expiresIn: '60' }, NOW)).toEqual({
      uid: 'u',
      idToken: 'i',
      refreshToken: 'r',
      expiresAt: NOW + 60_000,
    });
  });

  it('recognises an already-linked Google account as an HTTP error', () => {
    expect(() => parseSignInWithIdp(false, { error: { message: 'FEDERATED_USER_ID_ALREADY_LINKED' } }, NOW)).toThrow(
      expect.objectContaining({ code: 'FEDERATED_USER_ID_ALREADY_LINKED' }),
    );
  });

  it('recognises it in a 200 body too, as returnIdpCredential can send it', () => {
    expect(() => parseSignInWithIdp(true, { errorMessage: 'FEDERATED_USER_ID_ALREADY_LINKED' }, NOW)).toThrow(IdentityError);
  });

  it('keeps only the code from a message with detail after it', () => {
    expect(() => parseSignInWithIdp(false, { error: { message: 'USER_DISABLED : The user account has been disabled.' } }, NOW)).toThrow(
      expect.objectContaining({ code: 'USER_DISABLED' }),
    );
  });

  it('refuses a malformed success', () => {
    expect(() => parseSignInWithIdp(true, { localId: 'u' }, NOW)).toThrow(expect.objectContaining({ code: 'UNKNOWN' }));
  });
});
