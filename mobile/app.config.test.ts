import { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const configure = createRequire(import.meta.url)('./app.config.js') as (input: { config: Record<string, unknown> }) => Record<string, unknown>;
beforeEach(() => {
  for (const [key, value] of Object.entries({
    EAS_BUILD_PROFILE: 'production', EAS_BUILD_PLATFORM: 'android', EXPO_PUBLIC_USE_MOCK_API: 'false',
    EXPO_PUBLIC_API_BASE_URL: 'https://api.maven.test', EXPO_PUBLIC_FIREBASE_API_KEY: 'public-key',
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_public', GOOGLE_SERVICES_JSON: '/private/google-services.json',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://maven.dev/privacy', EXPO_PUBLIC_TERMS_URL: 'https://maven.dev/terms',
    EXPO_PUBLIC_SUPPORT_URL: 'https://maven.dev/support', EXPO_PUBLIC_APP_CHECK_DEBUG: 'false',
  })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it('wires native plugins without removing existing configuration', () => {
  const result = configure({ config: { name: 'Maven', plugins: ['expo-secure-store'] } });
  expect(result.name).toBe('Maven');
  expect(result.plugins).toEqual(expect.arrayContaining(['expo-secure-store', '@react-native-firebase/app', '@react-native-firebase/app-check']));
  expect(result.android).toEqual({ googleServicesFile: '/private/google-services.json' });
});
it.each(['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_SUPPORT_URL', 'GOOGLE_SERVICES_JSON'])('blocks production without %s', (key) => {
  vi.stubEnv(key, ''); expect(() => configure({ config: {} })).toThrow();
});
it.each(['http://maven.dev/privacy', 'https://example.com/privacy', 'https://localhost/privacy', 'https://user:password@maven.dev'])('rejects unsafe or placeholder policy URLs %s', (url) => {
  vi.stubEnv('EXPO_PUBLIC_PRIVACY_POLICY_URL', url); expect(() => configure({ config: {} })).toThrow();
});
it('forbids production debug providers', () => {
  vi.stubEnv('EXPO_PUBLIC_APP_CHECK_DEBUG', 'true'); expect(() => configure({ config: {} })).toThrow('debug');
});
it('allows unconfigured development/mock mode', () => {
  vi.stubEnv('EAS_BUILD_PROFILE', 'development'); vi.stubEnv('GOOGLE_SERVICES_JSON', '');
  expect(() => configure({ config: {} })).not.toThrow();
});

it.each(['ios', 'android'])('accepts complete production configuration for %s', (platform) => {
  vi.stubEnv('EAS_BUILD_PLATFORM', platform);
  vi.stubEnv('GOOGLE_SERVICES_PLIST', '/private/GoogleService-Info.plist');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_IOS_KEY', 'appl_public');
  expect(() => configure({ config: {} })).not.toThrow();
});
it.each(['ios', 'android'])('rejects test/secret purchase keys on %s', (platform) => {
  vi.stubEnv('EAS_BUILD_PLATFORM', platform);
  vi.stubEnv('GOOGLE_SERVICES_PLIST', '/private/GoogleService-Info.plist');
  for (const key of ['', 'test_not-real', 'sk_not-real']) {
    vi.stubEnv(platform === 'ios' ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY' : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', key);
    expect(() => configure({ config: {} })).toThrow();
  }
});
it.each([
  ['EXPO_PUBLIC_USE_MOCK_API', 'true'], ['EXPO_PUBLIC_API_BASE_URL', 'http://localhost:8080'],
  ['EXPO_PUBLIC_FIREBASE_API_KEY', ''],
])('rejects invalid production %s', (key, value) => {
  vi.stubEnv(key, value); expect(() => configure({ config: {} })).toThrow();
});

it('requires live staging configuration for the demo build profile', () => {
  vi.stubEnv('EAS_BUILD_PROFILE', 'demo');
  vi.stubEnv('EXPO_PUBLIC_APP_CHECK_DEBUG', 'true');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'goog_demo_public');
  vi.stubEnv('GOOGLE_SERVICES_JSON', '');
  expect(() => configure({ config: {} })).toThrow(/demo.*GOOGLE_SERVICES_JSON/iu);
});

it.each(['ios', 'android'])('accepts a complete staging demo configuration for %s with debug App Check', (platform) => {
  vi.stubEnv('EAS_BUILD_PROFILE', 'demo');
  vi.stubEnv('EAS_BUILD_PLATFORM', platform);
  vi.stubEnv('EXPO_PUBLIC_APP_CHECK_DEBUG', 'true');
  vi.stubEnv(platform === 'ios' ? 'GOOGLE_SERVICES_PLIST' : 'GOOGLE_SERVICES_JSON', `/private/${platform}-firebase-config`);
  vi.stubEnv(platform === 'ios' ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY' : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', `${platform}_staging_public`);
  expect(() => configure({ config: {} })).not.toThrow();
});

it.each([
  ['EXPO_PUBLIC_USE_MOCK_API', 'true'],
  ['EXPO_PUBLIC_APP_CHECK_DEBUG', 'false'],
  ['EXPO_PUBLIC_API_BASE_URL', 'http://localhost:8080'],
  ['EXPO_PUBLIC_FIREBASE_API_KEY', ''],
  ['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', ''],
  ['EXPO_PUBLIC_PRIVACY_POLICY_URL', ''],
  ['EXPO_PUBLIC_TERMS_URL', ''],
  ['EXPO_PUBLIC_SUPPORT_URL', ''],
])('rejects demo configuration with unsafe %s', (key, value) => {
  vi.stubEnv('EAS_BUILD_PROFILE', 'demo');
  vi.stubEnv('EXPO_PUBLIC_APP_CHECK_DEBUG', 'true');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'goog_staging_public');
  vi.stubEnv(key, value);
  expect(() => configure({ config: {} })).toThrow();
});
