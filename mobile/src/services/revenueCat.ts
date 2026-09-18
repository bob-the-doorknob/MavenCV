import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

export interface EntitlementInfoSource {
  entitlements: {
    active: Readonly<Record<string, unknown>>;
  };
}

export const hasProEntitlement = (customerInfo: EntitlementInfoSource): boolean =>
  customerInfo.entitlements.active.pro !== undefined;

export const configureRevenueCat = (): boolean => {
  const apiKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  });

  if (!apiKey) {
    return false;
  }

  Purchases.configure({ apiKey });
  return true;
};
