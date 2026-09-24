import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const CONSENT_VERSION = 1;
export const CONSENT_KEY = 'maven-ai-consent';
interface ConsentState { loaded: boolean; acceptedAt: string | null; busy: boolean; error: string | null; unsavedChoice: boolean | null }
export const useConsent = create<ConsentState>(() => ({ loaded: false, acceptedAt: null, busy: false, error: null, unsavedChoice: null }));
let hydration: Promise<void> | undefined;

export const loadConsent = (): Promise<void> => {
  hydration ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(CONSENT_KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      const valid = typeof value === 'object' && value !== null && 'version' in value && value.version === CONSENT_VERSION &&
        'acceptedAt' in value && typeof value.acceptedAt === 'string' && Number.isFinite(Date.parse(value.acceptedAt));
      useConsent.setState({ acceptedAt: valid ? value.acceptedAt as string : null });
    } catch { useConsent.setState({ acceptedAt: null, error: 'Could not read your privacy choice. Please choose again.' }); }
    finally { useConsent.setState({ loaded: true }); }
  })();
  return hydration;
};

export const setAiConsent = async (accepted: boolean): Promise<void> => {
  if (!useConsent.getState().loaded) await loadConsent();
  if (useConsent.getState().busy) return;
  // Revoke in memory before any asynchronous write or new request.
  useConsent.setState({ busy: true, error: null, ...(!accepted ? { acceptedAt: null } : {}) });
  const acceptedAt = accepted ? new Date().toISOString() : null;
  try {
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, acceptedAt }));
    useConsent.setState({ acceptedAt, unsavedChoice: null });
  } catch {
    useConsent.setState({ acceptedAt: null, unsavedChoice: accepted, error: 'Could not save your choice. AI is paused for this session. Retry before closing the app.' });
  } finally { useConsent.setState({ busy: false }); }
};

export const hasAiConsent = (): boolean => useConsent.getState().loaded && useConsent.getState().acceptedAt !== null;

export const legalLinks = () => [
  { label: 'Privacy Policy', url: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL },
  { label: 'Terms of Use', url: process.env.EXPO_PUBLIC_TERMS_URL },
  { label: 'Support', url: process.env.EXPO_PUBLIC_SUPPORT_URL },
].map(({ label, url }) => ({ label, url: url && /^https:\/\/[^\s/]+(?:\/|$)/u.test(url) ? url : null }));
