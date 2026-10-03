import { SYNC_COPY_REVIEWED } from '../config/launch';
import { mockGoogleIdToken } from './mockAuthBackend';

/**
 * The one seam the Google sign-in library will plug into. Everything above
 * it — linking, conflicts, sync, deletion — is built and tested against this
 * interface, so choosing a library later is a leaf change: implement these
 * three methods and return the implementation from `getGoogleProvider`.
 * See docs/google-signin-options.md.
 */
export interface GoogleCredential {
  /** A Google-issued OpenID Connect ID token, for Firebase's signInWithIdp. */
  idToken: string;
  email?: string;
}

export interface GoogleCredentialProvider {
  /** False when this build has no working Google sign-in. Callers check before offering it. */
  isAvailable(): boolean;
  /** Shows Google's account picker. Rejects with GoogleSignInCancelled if the user backs out. */
  signIn(): Promise<GoogleCredential>;
  /** Forgets the Google account on this device, so the next sign-in shows the picker again. */
  signOut(): Promise<void>;
}

export class GoogleSignInCancelled extends Error {
  public constructor() {
    super('Google sign-in was cancelled');
    this.name = 'GoogleSignInCancelled';
  }
}

export class GoogleSignInUnavailable extends Error {
  public constructor() {
    super("Google sign-in isn't available in this build");
    this.name = 'GoogleSignInUnavailable';
  }
}

/** Real builds until a library is wired in: honest about it, never half-works. */
export const unavailableGoogleProvider: GoogleCredentialProvider = {
  isAvailable: () => false,
  signIn: () => Promise.reject(new GoogleSignInUnavailable()),
  signOut: async () => {},
};

export interface MockGoogleOptions {
  sub?: string;
  email?: string;
  /** Simulates the user closing the picker. */
  cancel?: boolean;
}

/** Providers made by createMockGoogleProvider, so "mock" is told by identity, not by a label a real one could copy. */
const mockProviders = new WeakSet<object>();

/** Issues tokens the mock auth backend understands. Mock mode and tests only. */
export const createMockGoogleProvider = (options: MockGoogleOptions = {}): GoogleCredentialProvider & {
  signedIn: () => boolean;
} => {
  let signedIn = false;
  const sub = options.sub ?? 'mock-google-user';
  const email = options.email ?? 'student@example.com';
  const provider = {
    isAvailable: () => true,
    // Not `async`: nothing here awaits. They return promises because the interface does.
    signIn: () => {
      if (options.cancel) return Promise.reject(new GoogleSignInCancelled());
      signedIn = true;
      return Promise.resolve({ idToken: mockGoogleIdToken(sub, email), email });
    },
    signOut: () => {
      signedIn = false;
      return Promise.resolve();
    },
    signedIn: () => signedIn,
  };
  mockProviders.add(provider);
  return provider;
};

const isDevBuild = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;
const isMockMode = (): boolean => process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';

let override: GoogleCredentialProvider | null = null;
const devMockProvider = createMockGoogleProvider();

/**
 * THE one place the chosen Google sign-in library plugs in: return its
 * GoogleCredentialProvider here. Null until a library is chosen. Wiring one in
 * is blocked by a test until SYNC_COPY_REVIEWED is true — see
 * docs/launch-checklist.md.
 */
const realGoogleProvider = (): GoogleCredentialProvider | null => null;

/**
 * Mock mode in a development build gets the mock provider; every other build
 * gets the real provider if one is wired in, else the unavailable stub. A
 * release build can never reach the mock, even with the mock flag set.
 */
export const getGoogleProvider = (): GoogleCredentialProvider => {
  if (override) return override;
  if (isDevBuild() && isMockMode()) return devMockProvider;
  return realGoogleProvider() ?? unavailableGoogleProvider;
};

/** A real provider is anything that is neither the unavailable stub nor a mock. */
export const isRealGoogleProvider = (provider: GoogleCredentialProvider): boolean =>
  provider !== unavailableGoogleProvider && !mockProviders.has(provider);

/**
 * Why this build must not ship, or null if it can. A real Google provider
 * with SYNC_COPY_REVIEWED still false means account sync would go live before
 * the privacy text, consent and policy were reviewed.
 */
export const googleProviderViolation = (): string | null => {
  if (SYNC_COPY_REVIEWED || !isRealGoogleProvider(getGoogleProvider())) return null;
  return 'A real Google sign-in provider is wired in while SYNC_COPY_REVIEWED is false. Finish docs/launch-checklist.md, then set SYNC_COPY_REVIEWED to true in src/config/launch.ts.';
};

/** Tests only. */
export const setGoogleProviderForTests = (provider: GoogleCredentialProvider | null): void => {
  override = provider;
};
