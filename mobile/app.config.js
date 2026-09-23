// Public build configuration only. Never add service-account or AI secrets here.
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PROFILE === 'production') {
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
      const key = platform === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
      if (!key?.trim() || key.startsWith('test_') || key.startsWith('sk_')) {
        throw new Error(`Production requires a store-specific public RevenueCat SDK key for ${platform}`);
      }
    }
  }
  return config;
};
