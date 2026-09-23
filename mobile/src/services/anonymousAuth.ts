import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'trajectory-firebase-anonymous-auth-v1';
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const FIREBASE_REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';

interface AuthSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

let pending: Promise<string> | undefined;
let cached: AuthSession | undefined;
class InvalidRefreshToken extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readSession = async (): Promise<AuthSession | undefined> => {
  const refreshToken = await SecureStore.getItemAsync(STORAGE_KEY);
  if (refreshToken) {
    // Resume cleanup if a previous migration was interrupted after secure write.
    if (await AsyncStorage.getItem(STORAGE_KEY) !== null) await AsyncStorage.removeItem(STORAGE_KEY);
    return cached?.refreshToken === refreshToken ? cached : { idToken: '', refreshToken, expiresAt: 0 };
  }
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (!saved) return undefined;
  let value: unknown;
  try { value = JSON.parse(saved); } catch { return undefined; }
  if (!isRecord(value) || typeof value.idToken !== 'string' || typeof value.refreshToken !== 'string' || typeof value.expiresAt !== 'number') {
    return undefined;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value.refreshToken);
  if (await SecureStore.getItemAsync(STORAGE_KEY) !== value.refreshToken) throw new Error('Could not securely migrate session');
  await AsyncStorage.removeItem(STORAGE_KEY);
  cached = { idToken: value.idToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt };
  return cached;
};

const requestSession = async (url: string, body: string, contentType: string, refresh: boolean): Promise<AuthSession> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let value: unknown;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: controller.signal });
    value = await response.json();
    if (!response.ok) {
      const code = isRecord(value) && isRecord(value.error) ? value.error.message : undefined;
      if (refresh && (code === 'INVALID_REFRESH_TOKEN' || code === 'TOKEN_EXPIRED' || code === 'USER_NOT_FOUND')) throw new InvalidRefreshToken();
      throw new Error('Firebase authentication failed');
    }
  } finally { clearTimeout(timer); }
  if (!isRecord(value)) throw new Error('Firebase authentication failed');
  const idToken = value[refresh ? 'id_token' : 'idToken'];
  const refreshToken = value[refresh ? 'refresh_token' : 'refreshToken'];
  const expiresIn = Number(value[refresh ? 'expires_in' : 'expiresIn']);
  if (typeof idToken !== 'string' || !idToken || typeof refreshToken !== 'string' || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Firebase authentication failed');
  }
  const session = { idToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
  await SecureStore.setItemAsync(STORAGE_KEY, refreshToken);
  if (await SecureStore.getItemAsync(STORAGE_KEY) !== refreshToken) throw new Error('Could not securely save session');
  if (await AsyncStorage.getItem(STORAGE_KEY) !== null) await AsyncStorage.removeItem(STORAGE_KEY);
  cached = session;
  return session;
};

const acquireIdToken = async (): Promise<string> => {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_FIREBASE_API_KEY is required');
  const session = await readSession();
  if (session && session.expiresAt > Date.now() + 60_000) return session.idToken;
  if (session) {
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`;
    try {
      return (await requestSession(`${FIREBASE_REFRESH_URL}?key=${encodeURIComponent(apiKey)}`, body, 'application/x-www-form-urlencoded', true)).idToken;
    } catch (error) {
      if (!(error instanceof InvalidRefreshToken)) throw error;
    }
  }
  return (await requestSession(`${FIREBASE_AUTH_URL}?key=${encodeURIComponent(apiKey)}`, JSON.stringify({ returnSecureToken: true }), 'application/json', false)).idToken;
};

export const getAnonymousIdToken = (): Promise<string> => {
  pending ??= acquireIdToken().finally(() => { pending = undefined; });
  return pending;
};
