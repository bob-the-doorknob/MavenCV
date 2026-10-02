import { clearSession, getAnonymousIdToken, replaceSession } from './anonymousAuth';
import { IdentityError, type AuthBackend, type IdentityErrorCode, type IdpSession } from './identityTypes';

export { IdentityError, type AuthBackend, type IdentityErrorCode, type IdpSession } from './identityTypes';

/**
 * The Firebase session operations the account system needs, behind one
 * interface so mock mode and tests can swap the whole backend. The real
 * implementation is the Identity Toolkit REST API this app already uses for
 * anonymous sign-in — no Firebase JS SDK, no new dependency.
 */

const SIGN_IN_WITH_IDP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp';
const TIMEOUT_MS = 15_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KNOWN_CODES: readonly IdentityErrorCode[] = ['FEDERATED_USER_ID_ALREADY_LINKED', 'INVALID_IDP_RESPONSE', 'USER_DISABLED'];

/** "FEDERATED_USER_ID_ALREADY_LINKED : details" → the code before any detail. */
const codeOf = (message: unknown): IdentityErrorCode => {
  if (typeof message !== 'string') return 'UNKNOWN';
  const head = message.split(/[\s:]/u)[0] ?? '';
  return (KNOWN_CODES as readonly string[]).includes(head) ? (head as IdentityErrorCode) : 'UNKNOWN';
};

/**
 * Builds the signInWithIdp request body. Exported for tests: the shape is
 * the part most likely to be wrong and least visible when it is.
 */
export const signInWithIdpBody = (googleIdToken: string, linkToIdToken?: string): Record<string, unknown> => ({
  postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
  // Required by the API; unused for an ID-token exchange.
  requestUri: 'http://localhost',
  returnSecureToken: true,
  returnIdpCredential: true,
  ...(linkToIdToken ? { idToken: linkToIdToken } : {}),
});

/** Parses a signInWithIdp response, success or failure. Exported for tests. */
export const parseSignInWithIdp = (ok: boolean, value: unknown, now: number): IdpSession => {
  if (!ok) {
    const message = isRecord(value) && isRecord(value.error) ? value.error.message : undefined;
    throw new IdentityError(codeOf(message), typeof message === 'string' ? message : undefined);
  }
  if (!isRecord(value)) throw new IdentityError('UNKNOWN', 'Malformed sign-in response');
  // With returnIdpCredential, an already-linked credential can come back as
  // a 200 carrying errorMessage instead of an HTTP error. Treat both alike.
  if (typeof value.errorMessage === 'string') throw new IdentityError(codeOf(value.errorMessage), value.errorMessage);
  const { localId, idToken, refreshToken, email } = value;
  const expiresIn = Number(value.expiresIn);
  if (typeof localId !== 'string' || !localId || typeof idToken !== 'string' || !idToken || typeof refreshToken !== 'string' || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new IdentityError('UNKNOWN', 'Malformed sign-in response');
  }
  return {
    uid: localId,
    idToken,
    refreshToken,
    expiresAt: now + expiresIn * 1_000,
    ...(typeof email === 'string' && email ? { email } : {}),
  };
};

export const restAuthBackend: AuthBackend = {
  currentIdToken: getAnonymousIdToken,

  signInWithGoogle: async (googleIdToken, linkToIdToken) => {
    const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) throw new IdentityError('UNKNOWN', 'EXPO_PUBLIC_FIREBASE_API_KEY is required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let value: unknown;
    try {
      response = await fetch(`${SIGN_IN_WITH_IDP_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signInWithIdpBody(googleIdToken, linkToIdToken)),
        signal: controller.signal,
      });
      value = await response.json();
    } catch {
      throw new IdentityError('NETWORK', 'Could not reach Firebase');
    } finally {
      clearTimeout(timer);
    }
    return parseSignInWithIdp(response.ok, value, Date.now());
  },

  adoptSession: (session) =>
    replaceSession({ idToken: session.idToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt }),

  clearSession,
};
