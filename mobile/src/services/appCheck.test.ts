import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ constants: { executionEnvironment: 'bare' }, configure: vi.fn(), getToken: vi.fn(), initialize: vi.fn() }));
vi.mock('expo-constants', () => ({ default: mocks.constants }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@react-native-firebase/app', () => ({ getApp: () => ({ name: 'default' }) }));
vi.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: class { configure = mocks.configure; },
  initializeAppCheck: mocks.initialize, getToken: mocks.getToken,
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.constants.executionEnvironment = 'bare'; mocks.getToken.mockResolvedValue({ token: 'token' }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('native App Check adapter', () => {
  it('rejects Expo Go without loading native Firebase', async () => {
    mocks.constants.executionEnvironment = 'storeClient';
    await expect((await import('./appCheck')).getAppCheckToken()).rejects.toThrow('native development');
    expect(mocks.initialize).not.toHaveBeenCalled();
  });
  it('uses production providers even when a release has the debug flag', async () => {
    vi.stubGlobal('__DEV__', false); vi.stubEnv('EXPO_PUBLIC_APP_CHECK_DEBUG', 'true');
    const { getAppCheckToken } = await import('./appCheck');
    expect(await getAppCheckToken()).toBe('token'); await getAppCheckToken();
    expect(mocks.configure).toHaveBeenCalledWith({ android: { provider: 'playIntegrity' }, apple: { provider: 'appAttestWithDeviceCheckFallback' } });
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });
  it('allows the debug provider only on explicit development opt-in', async () => {
    vi.stubGlobal('__DEV__', true); vi.stubEnv('EXPO_PUBLIC_APP_CHECK_DEBUG', 'true');
    await (await import('./appCheck')).getAppCheckToken();
    expect(mocks.configure).toHaveBeenCalledWith({ android: { provider: 'debug' }, apple: { provider: 'debug' } });
  });
  it('rejects empty tokens', async () => {
    mocks.getToken.mockResolvedValueOnce({ token: '' });
    await expect((await import('./appCheck')).getAppCheckToken()).rejects.toThrow('Missing');
  });
  it('times out stalled native token requests', async () => {
    vi.useFakeTimers(); mocks.getToken.mockImplementationOnce(() => new Promise(() => undefined));
    const request = (await import('./appCheck')).getAppCheckToken();
    const assertion = expect(request).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});
