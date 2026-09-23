import { getAnonymousIdToken } from './anonymousAuth';

/**
 * The backend authenticates every AI route, so api.ts sends this on each
 * request. Returns null when a token can't be obtained (no Firebase key, or
 * the sign-in failed) — api.ts then sends no header and the backend answers
 * 401, which surfaces as an ApiError of kind 'auth'.
 */
export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await getAnonymousIdToken();
  } catch {
    return null;
  }
};
