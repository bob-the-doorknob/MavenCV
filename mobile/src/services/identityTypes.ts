/**
 * Types shared by the real and mock auth backends. Dependency-free on
 * purpose: the mock backend is imported by api.ts, and must not drag the
 * native session store in with it.
 */

export interface IdpSession {
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
}

/** Identity Toolkit's error messages that the account flow acts on. */
export type IdentityErrorCode =
  | 'FEDERATED_USER_ID_ALREADY_LINKED'
  | 'INVALID_IDP_RESPONSE'
  | 'USER_DISABLED'
  | 'NETWORK'
  | 'UNKNOWN';

export class IdentityError extends Error {
  public constructor(public readonly code: IdentityErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'IdentityError';
  }
}

export interface AuthBackend {
  /** The device's current session token, signing in anonymously if there is none. */
  currentIdToken(): Promise<string>;
  /**
   * Exchanges a Google ID token for a Firebase session. With `linkToIdToken`
   * it links Google to that existing user and keeps its UID; without, it
   * signs in to whichever user Google is already linked to (creating one if
   * none).
   */
  signInWithGoogle(googleIdToken: string, linkToIdToken?: string): Promise<IdpSession>;
  /** Makes `session` the device session. */
  adoptSession(session: IdpSession): Promise<void>;
  /** Drops the device session; the next request starts a fresh anonymous one. */
  clearSession(): Promise<void>;
}
