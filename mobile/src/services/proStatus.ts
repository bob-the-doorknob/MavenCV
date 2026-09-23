import Purchases from 'react-native-purchases';

import { hasProEntitlement } from './entitlements';
import { isPurchasesSupported } from './revenueCat';

/**
 * False whenever the entitlement can't be read — an unconfigured SDK or Expo
 * Go, where the native module is missing. Premium stays locked rather than
 * accidentally open.
 */
export const checkProEntitlement = async (): Promise<boolean> => {
  if (!isPurchasesSupported()) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return hasProEntitlement(customerInfo);
  } catch {
    return false;
  }
};
