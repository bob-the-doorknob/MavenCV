import Constants from 'expo-constants';
import { Platform } from 'react-native';

let tokenReader: Promise<() => Promise<string>> | undefined;
const initialize = async (): Promise<() => Promise<string>> => {
  // Do not load native Firebase in Expo Go. Mock API never calls this adapter.
  if (Constants.executionEnvironment === 'storeClient' || !['ios', 'android'].includes(Platform.OS)) {
    throw new Error('App Check requires a native development or store build.');
  }
  const [{ getApp }, { initializeAppCheck, getToken, ReactNativeFirebaseAppCheckProvider }] = await Promise.all([
    import('@react-native-firebase/app'), import('@react-native-firebase/app-check'),
  ]);
  const debug = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_APP_CHECK_DEBUG === 'true';
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: debug ? 'debug' : 'playIntegrity' },
    apple: { provider: debug ? 'debug' : 'appAttestWithDeviceCheckFallback' },
  });
  const appCheck = initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  return async () => {
    const { token } = await getToken(appCheck, false);
    if (!token.trim()) throw new Error('Missing App Check token.');
    return token;
  };
};

export const getAppCheckToken = async (): Promise<string> => {
  tokenReader ??= initialize().catch((error: unknown) => { tokenReader = undefined; throw error; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      tokenReader.then((read) => read()),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('App verification timed out.')), 15_000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
};
