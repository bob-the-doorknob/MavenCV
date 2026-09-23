import { useCallback, useEffect, useState } from 'react';
import Purchases, { type CustomerInfo } from 'react-native-purchases';

import { hasProEntitlement } from './entitlements';
import { checkProEntitlement } from './proStatus';

export const useProStatus = () => {
  const [isPro, setIsPro] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const refresh = useCallback(async () => {
    setIsPro(await checkProEntitlement());
    setIsChecking(false);
  }, []);

  useEffect(() => {
    void refresh();

    // Keeps every screen in sync when a purchase lands, without polling.
    const listener = (info: CustomerInfo) => setIsPro(hasProEntitlement(info));

    try {
      Purchases.addCustomerInfoUpdateListener(listener);
    } catch {
      return;
    }

    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(listener);
      } catch {
        // SDK not configured — nothing to remove.
      }
    };
  }, [refresh]);

  return { isPro, isChecking, refresh };
};