import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

export { hasProEntitlement, type EntitlementInfoSource } from './entitlements';

export const configureRevenueCat = (): boolean => {
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

  if (!apiKey) {
    return false;
  }

  Purchases.configure({ apiKey });
  return true;
};
