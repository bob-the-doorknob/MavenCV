import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'trajectory-firebase-anonymous-auth-v1';
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const FIREBASE_REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';

interface AuthSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

let pending: Promise<string> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readSession = async (): Promise<AuthSession | undefined> => {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (!saved) return undefined;
  let value: unknown;
  try { value = JSON.parse(saved); } catch { throw new Error('Saved Firebase session is invalid'); }
  if (!isRecord(value) || typeof value.idToken !== 'string' || typeof value.refreshToken !== 'string' || typeof value.expiresAt !== 'number') {
    throw new Error('Saved Firebase session is invalid');
  }
  return { idToken: value.idToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt };
};

const requestSession = async (url: string, body: string, contentType: string, refresh: boolean): Promise<AuthSession> => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  if (!response.ok) throw new Error('Firebase authentication failed');
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error('Firebase authentication failed');
  const idToken = value[refresh ? 'id_token' : 'idToken'];
  const refreshToken = value[refresh ? 'refresh_token' : 'refreshToken'];
  const expiresIn = Number(value[refresh ? 'expires_in' : 'expiresIn']);
  if (typeof idToken !== 'string' || !idToken || typeof refreshToken !== 'string' || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Firebase authentication failed');
  }
  const session = { idToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
};

const acquireIdToken = async (): Promise<string> => {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_FIREBASE_API_KEY is required');
  const session = await readSession();
  if (session && session.expiresAt > Date.now() + 60_000) return session.idToken;
  if (session) {
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`;
    return (await requestSession(`${FIREBASE_REFRESH_URL}?key=${encodeURIComponent(apiKey)}`, body, 'application/x-www-form-urlencoded', true)).idToken;
  }
  return (await requestSession(`${FIREBASE_AUTH_URL}?key=${encodeURIComponent(apiKey)}`, JSON.stringify({ returnSecureToken: true }), 'application/json', false)).idToken;
};

export const getAnonymousIdToken = (): Promise<string> => {
  pending ??= acquireIdToken().finally(() => { pending = undefined; });
  return pending;
};
