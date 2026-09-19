export interface EntitlementInfoSource {
  entitlements: {
    active: Readonly<Record<string, unknown>>;
  };
}

export const hasProEntitlement = (customerInfo: EntitlementInfoSource): boolean =>
  customerInfo.entitlements.active.pro !== undefined;
