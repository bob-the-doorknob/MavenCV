import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { googleProviderViolation, getGoogleProvider, isRealGoogleProvider } from '../services/googleCredential';

/**
 * The tripwire. It reads the real SYNC_COPY_REVIEWED, so it fails the build
 * the moment a real Google provider is wired into getGoogleProvider() while
 * the flag is still false. If it fails: finish docs/launch-checklist.md first.
 */
describe('launch gate: Google sign-in cannot ship before the sync copy is reviewed', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ships no real Google provider while SYNC_COPY_REVIEWED is false', () => {
    expect(googleProviderViolation()).toBeNull();
  });

  it('currently ships the unavailable stub', () => {
    expect(isRealGoogleProvider(getGoogleProvider())).toBe(false);
  });
});
