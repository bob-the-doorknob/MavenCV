import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleSignInUnavailable, getGoogleProvider } from './googleCredential';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getGoogleProvider', () => {
  it('gives a development build in mock mode the mock provider', () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'true');
    expect(getGoogleProvider().isAvailable()).toBe(true);
  });

  it.each([
    ['a release build with the mock flag set', false, 'true'],
    ['a release build', false, 'false'],
    ['a development build against the real backend', true, 'false'],
  ])('reports unavailable in %s until a library is wired in', async (_label, dev, mock) => {
    vi.stubGlobal('__DEV__', dev);
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', mock);
    const provider = getGoogleProvider();
    expect(provider.isAvailable()).toBe(false);
    await expect(provider.signIn()).rejects.toBeInstanceOf(GoogleSignInUnavailable);
  });
});
