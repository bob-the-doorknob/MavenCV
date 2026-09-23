import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constants: { executionEnvironment: 'bare' },
  configure: vi.fn(), getCustomerInfo: vi.fn(), restorePurchases: vi.fn(), present: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-constants', () => ({ default: mocks.constants }));
vi.mock('react-native-purchases', () => ({ default: mocks }));
vi.mock('react-native-purchases-ui', () => ({
  default: { presentPaywallIfNeeded: mocks.present },
  PAYWALL_RESULT: { PURCHASED: 'purchased', RESTORED: 'restored', NOT_PRESENTED: 'not-presented', CANCELLED: 'cancelled', ERROR: 'error' },
}));
import { configureRevenueCat, presentProPaywall, restorePurchases } from './revenueCat';

beforeEach(() => { vi.clearAllMocks(); mocks.constants.executionEnvironment = 'bare'; });
it('never configures native purchases in Expo Go', () => {
  mocks.constants.executionEnvironment = 'storeClient';
  expect(configureRevenueCat()).toBe(false);
  expect(mocks.configure).not.toHaveBeenCalled();
});
it('recognizes an existing entitlement when no paywall needs presenting', async () => {
  mocks.present.mockResolvedValue('not-presented');
  mocks.getCustomerInfo.mockResolvedValue({ entitlements: { active: { pro: {} } } });
  expect(await presentProPaywall()).toBe(true);
});
it('does not unlock based solely on a purchased result', async () => {
  mocks.present.mockResolvedValue('purchased');
  mocks.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } });
  expect(await presentProPaywall()).toBe(false);
});
it('surfaces restore failures instead of treating them as no subscription', async () => {
  mocks.restorePurchases.mockRejectedValue(new Error('offline'));
  await expect(restorePurchases()).rejects.toThrow('Unable to restore');
});
