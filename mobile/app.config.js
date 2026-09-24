// Public build configuration only. Never add service-account or AI secrets here.
module.exports = ({ config }) => {
  const nativeFiles = {
    ios: process.env.GOOGLE_SERVICES_PLIST,
    android: process.env.GOOGLE_SERVICES_JSON,
  };
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    if (process.env.EXPO_PUBLIC_APP_CHECK_DEBUG === 'true') throw new Error('Production cannot use App Check debug mode');
    for (const name of ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_SUPPORT_URL']) {
      const value = process.env[name];
      let url;
      try { url = new URL(value); } catch { throw new Error(`Production requires a published HTTPS ${name}`); }
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /(^|\.)(localhost|example\.(com|org|net)|test|invalid)$/u.test(url.hostname)) {
        throw new Error(`Production requires a published HTTPS ${name}`);
      }
    }
    if (process.env.EXPO_PUBLIC_USE_MOCK_API !== 'false') {
      throw new Error('Production requires EXPO_PUBLIC_USE_MOCK_API=false');
    }
    const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!baseUrl || !/^https:\/\/[^/\s]+/u.test(baseUrl)) {
      throw new Error('Production requires an HTTPS EXPO_PUBLIC_API_BASE_URL');
    }
    if (!process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim()) {
      throw new Error('Production requires EXPO_PUBLIC_FIREBASE_API_KEY');
    }
    const platforms = process.env.EAS_BUILD_PLATFORM ? [process.env.EAS_BUILD_PLATFORM] : ['ios', 'android'];
    for (const platform of platforms) {
      if (!nativeFiles[platform]) throw new Error(`Production requires the Firebase native configuration file for ${platform}`);
      const key = platform === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
      if (!key?.trim() || key.startsWith('test_') || key.startsWith('sk_')) {
        throw new Error(`Production requires a store-specific public RevenueCat SDK key for ${platform}`);
      }
    }
  }
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(nativeFiles.ios ? { googleServicesFile: nativeFiles.ios } : {}),
      entitlements: { ...config.ios?.entitlements, 'com.apple.developer.devicecheck.appattest-environment': 'production' },
    },
    android: { ...config.android, ...(nativeFiles.android ? { googleServicesFile: nativeFiles.android } : {}) },
    plugins: [
      ...(config.plugins ?? []),
      '@react-native-firebase/app',
      '@react-native-firebase/app-check',
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ],
  };
};
