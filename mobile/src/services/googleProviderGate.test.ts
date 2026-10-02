import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The flag is mocked here so the gate's own logic can be proven to bite.
// The real flag is checked in src/config/launch.test.ts.
const gate = vi.hoisted(() => ({ reviewed: false }));
vi.mock('../config/launch', () => ({
  get SYNC_COPY_REVIEWED() {
    return gate.reviewed;
  },
}));

import {
  createMockGoogleProvider,
  googleProviderViolation,
  isRealGoogleProvider,
  setGoogleProviderForTests,
  unavailableGoogleProvider,
  type GoogleCredentialProvider,
} from './googleCredential';

const fakeLibrary: GoogleCredentialProvider = {
  isAvailable: () => true,
  signIn: async () => ({ idToken: 'real-looking-token' }),
  signOut: async () => {},
};

beforeEach(() => {
  gate.reviewed = false;
  vi.stubGlobal('__DEV__', false);
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
});

afterEach(() => {
  setGoogleProviderForTests(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('googleProviderViolation', () => {
  it('fails when a real provider is wired in and the copy is not reviewed', () => {
    setGoogleProviderForTests(fakeLibrary);
    expect(googleProviderViolation()).toContain('SYNC_COPY_REVIEWED');
  });

  it('passes once the copy is reviewed', () => {
    gate.reviewed = true;
    setGoogleProviderForTests(fakeLibrary);
    expect(googleProviderViolation()).toBeNull();
  });

  it('allows the unavailable stub and the mock provider while unreviewed', () => {
    setGoogleProviderForTests(unavailableGoogleProvider);
    expect(googleProviderViolation()).toBeNull();
    setGoogleProviderForTests(createMockGoogleProvider());
    expect(googleProviderViolation()).toBeNull();
  });

  it('cannot be fooled by a real provider that copies a mock label', () => {
    const lookalike = { ...fakeLibrary, kind: 'mock', isMock: true } as GoogleCredentialProvider;
    expect(isRealGoogleProvider(lookalike)).toBe(true);
    expect(isRealGoogleProvider(createMockGoogleProvider())).toBe(false);
    expect(isRealGoogleProvider(unavailableGoogleProvider)).toBe(false);
  });
});
