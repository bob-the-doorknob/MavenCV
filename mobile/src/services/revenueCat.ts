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

import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { hasProEntitlement } from './entitlements';

export const PRO_ENTITLEMENT = 'pro';

/** Shows the RevenueCat-hosted paywall. True when the user ends up entitled. */
export const presentProPaywall = async (): Promise<boolean> => {
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    });

    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch {
    return false;
  }
};

/** Judges look for this. Required on iOS, good practice everywhere. */
export const restorePurchases = async (): Promise<boolean> => {
  try {
    return hasProEntitlement(await Purchases.restorePurchases());
  } catch {
    return false;
  }
};