/**
 * The environment variables the app reads, so that a misspelled name is a
 * compile error instead of a silent `undefined`. Types only: nothing here
 * exists at runtime. Expo inlines `process.env.EXPO_PUBLIC_*` at build time,
 * so the property-access spelling in the code must stay as it is.
 *
 * Add a name here when you add it to `.env.example`.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL?: string | undefined;
    EXPO_PUBLIC_USE_MOCK_API?: string | undefined;
    EXPO_PUBLIC_MOCK_FAIL?: string | undefined;
    EXPO_PUBLIC_FIREBASE_API_KEY?: string | undefined;
    EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string | undefined;
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string | undefined;
    EXPO_PUBLIC_PRIVACY_POLICY_URL?: string | undefined;
    EXPO_PUBLIC_TERMS_URL?: string | undefined;
    EXPO_PUBLIC_SUPPORT_URL?: string | undefined;
    EXPO_PUBLIC_APP_CHECK_DEBUG?: string | undefined;
    /** Build-time only, read by app.config.js and its test. */
    EAS_BUILD_PROFILE?: string | undefined;
    EAS_BUILD_PLATFORM?: string | undefined;
    GOOGLE_SERVICES_JSON?: string | undefined;
    GOOGLE_SERVICES_PLIST?: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
  }
}
