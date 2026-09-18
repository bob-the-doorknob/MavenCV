import { describe, expect, it } from 'vitest';

import { hasProEntitlement, type EntitlementInfoSource } from './entitlements';

describe('hasProEntitlement', () => {
  it('returns true when pro is active', () => {
    const customerInfo: EntitlementInfoSource = {
      entitlements: { active: { pro: {} } },
    };

    expect(hasProEntitlement(customerInfo)).toBe(true);
  });

  it('returns false when pro is absent', () => {
    const customerInfo: EntitlementInfoSource = {
      entitlements: { active: {} },
    };

    expect(hasProEntitlement(customerInfo)).toBe(false);
  });
});
