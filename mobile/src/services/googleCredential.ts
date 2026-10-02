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

/** Issues tokens the mock auth backend understands. Mock mode and tests only. */
export const createMockGoogleProvider = (options: MockGoogleOptions = {}): GoogleCredentialProvider & {
  signedIn: () => boolean;
} => {
  let signedIn = false;
  const sub = options.sub ?? 'mock-google-user';
  const email = options.email ?? 'student@example.com';
  return {
    isAvailable: () => true,
    signIn: async () => {
      if (options.cancel) throw new GoogleSignInCancelled();
      signedIn = true;
      return { idToken: mockGoogleIdToken(sub, email), email };
    },
    signOut: async () => {
      signedIn = false;
    },
    signedIn: () => signedIn,
  };
};

const isDevBuild = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;
const isMockMode = (): boolean => process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';

let override: GoogleCredentialProvider | null = null;
const devMockProvider = createMockGoogleProvider();

/**
 * Mock mode in a development build gets the mock provider; every other build
 * gets the unavailable stub until a library is chosen. A release build can
 * never reach the mock, even with the mock flag set.
 */
export const getGoogleProvider = (): GoogleCredentialProvider => {
  if (override) return override;
  return isDevBuild() && isMockMode() ? devMockProvider : unavailableGoogleProvider;
};

/** Tests only. */
export const setGoogleProviderForTests = (provider: GoogleCredentialProvider | null): void => {
  override = provider;
};
