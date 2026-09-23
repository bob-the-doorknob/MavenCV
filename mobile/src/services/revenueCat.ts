import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';

export const isPurchasesSupported = (): boolean => Constants.executionEnvironment !== 'storeClient' && (Platform.OS === 'ios' || Platform.OS === 'android');

export { hasProEntitlement, type EntitlementInfoSource } from './entitlements';

export const configureRevenueCat = (): boolean => {
  if (!isPurchasesSupported()) return false;
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

  if (!apiKey) {
    return false;
  }

  try { Purchases.configure({ apiKey }); return true; } catch { return false; }
};

import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { hasProEntitlement } from './entitlements';

export const PRO_ENTITLEMENT = 'pro';

/** Shows the RevenueCat-hosted paywall. True when the user ends up entitled. */
export const presentProPaywall = async (): Promise<boolean> => {
  if (!isPurchasesSupported()) throw new Error('Purchases require a configured development or store build.');
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    });

    if (result === PAYWALL_RESULT.CANCELLED) return false;
    if (result === PAYWALL_RESULT.ERROR) throw new Error('The store could not complete the purchase.');
    return hasProEntitlement(await Purchases.getCustomerInfo());
  } catch {
    throw new Error('Unable to open purchases. Check your connection and store configuration.');
  }
};

/** Judges look for this. Required on iOS, good practice everywhere. */
export const restorePurchases = async (): Promise<boolean> => {
  if (!isPurchasesSupported()) throw new Error('Restore requires a development or store build.');
  try {
    return hasProEntitlement(await Purchases.restorePurchases());
  } catch {
    throw new Error('Unable to restore purchases. Please try again.');
  }
};
