/**
 * Firebase auth is wired in later. Until then every backend request goes out
 * unauthenticated (no Authorization header) — real-mode calls will get a 401
 * from the backend, which is expected at this stage.
 */
export const getAuthToken = async (): Promise<string | null> => null;
