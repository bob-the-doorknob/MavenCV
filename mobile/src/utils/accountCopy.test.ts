import { describe, expect, it } from 'vitest';

import { conflictCopy, describeCounts } from './accountCopy';

describe('account copy', () => {
  it('pluralises counts', () => {
    expect(describeCounts({ roadmaps: 1, bullets: 0 })).toBe('1 roadmap and 0 CV bullets');
    expect(describeCounts({ roadmaps: 2, bullets: 1 })).toBe('2 roadmaps and 1 CV bullet');
  });

  it('names both sides in the choice and the losing side in each confirmation', () => {
    const copy = conflictCopy({ roadmaps: 3, bullets: 5 }, { roadmaps: 1, bullets: 2 });
    expect(copy.choose.message).toContain('In your account: 3 roadmaps and 5 CV bullets');
    expect(copy.choose.message).toContain('On this phone: 1 roadmap and 2 CV bullets');
    expect(copy.confirmCloud.message).toContain("This phone's 1 roadmap and 2 CV bullets will be deleted");
    expect(copy.confirmDevice.message).toContain("account's 3 roadmaps and 5 CV bullets will be deleted on every device");
  });
});
