import { describe, expect, it } from 'vitest';

import { paywallCopy, type PaywallContext } from './paywallCopy';

const context = (overrides: Partial<PaywallContext> = {}): PaywallContext => ({
  roleTitle: 'Software Engineer',
  readiness: 47,
  bulletCount: 3,
  targetCount: 1,
  ...overrides,
});

describe('paywallCopy — export trigger', () => {
  it('names the bullets the user has already earned', () => {
    const copy = paywallCopy('exportBullets', context());

    expect(copy.title).toBe('Export your 3 bullets in one tap');
    expect(copy.body).toContain('3 CV bullets');
    expect(copy.body).toContain('Software Engineer');
  });

  it('uses the singular for one bullet', () => {
    const copy = paywallCopy('exportBullets', context({ bulletCount: 1 }));

    expect(copy.title).toBe('Export your 1 bullet in one tap');
    expect(copy.body).toContain("You've earned 1 CV bullet");
    // "all of them" would be wrong for a single bullet.
    expect(copy.body).toContain('Pro copies it,');
    expect(copy.features[0]).toBe('Copy all 1 bullet as one block of text');
  });

  it('falls back to the score when nothing has been earned yet', () => {
    const copy = paywallCopy('exportBullets', context({ bulletCount: 0, readiness: 47 }));

    expect(copy.title).toBe('Keep your 47% toward Software Engineer');
    expect(copy.body).toContain("You're 47% ready toward Software Engineer");
  });

  it('drops the role clause when there is no role', () => {
    const copy = paywallCopy('exportBullets', context({ bulletCount: 0, roleTitle: null }));

    expect(copy.title).toBe('Keep your 47%');
    expect(copy.title).not.toContain('toward');
    expect(copy.body).not.toContain('toward');
  });

  it('reads sensibly at 0% with nothing earned', () => {
    const copy = paywallCopy('exportBullets', context({ bulletCount: 0, readiness: 0 }));

    expect(copy.title).toBe('Keep your 0% toward Software Engineer');
    expect(copy.features).toHaveLength(3);
  });

  it('reads sensibly at 100%', () => {
    const copy = paywallCopy('exportBullets', context({ readiness: 100, bulletCount: 7 }));

    expect(copy.title).toBe('Export your 7 bullets in one tap');
    expect(copy.body).toContain('7 CV bullets');
  });
});

describe('paywallCopy — add target trigger', () => {
  it('promises the current roadmap stays put', () => {
    const copy = paywallCopy('addTarget', context());

    expect(copy.title).toBe('Keep your 47% toward Software Engineer');
    expect(copy.body).toContain('stays exactly as it is');
    expect(copy.features[0]).toBe('Add a second target alongside your 1 current roadmap');
  });

  it('pluralizes the existing roadmaps', () => {
    const copy = paywallCopy('addTarget', context({ targetCount: 2 }));

    expect(copy.features[0]).toBe('Add a second target alongside your 2 current roadmaps');
  });

  it('handles having no target yet', () => {
    const copy = paywallCopy('addTarget', context({ roleTitle: null, targetCount: 0 }));

    expect(copy.title).toBe('Aim at more than one role');
    expect(copy.features[0]).toBe('Run several target roles at once');
  });
});

describe('paywallCopy — regenerate trigger', () => {
  it('promises finished work and its bullets survive', () => {
    const copy = paywallCopy('regenerate', context());

    expect(copy.title).toBe('Rebuild your Software Engineer roadmap');
    expect(copy.body).toContain('3 CV bullets');
    expect(copy.body).toContain('stays put');
  });

  it('omits the bullet clause when none are earned', () => {
    const copy = paywallCopy('regenerate', context({ bulletCount: 0 }));

    expect(copy.body).not.toContain('CV bullet');
    expect(copy.body).toContain('stays put');
  });

  it('handles having no role title', () => {
    expect(paywallCopy('regenerate', context({ roleTitle: null })).title).toBe(
      'Rebuild your roadmap',
    );
  });
});

describe('paywallCopy — shape', () => {
  it('always returns a title, body, three features and a CTA', () => {
    for (const trigger of ['exportBullets', 'addTarget', 'regenerate'] as const) {
      const copy = paywallCopy(trigger, context());

      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.features).toHaveLength(3);
      expect(copy.cta).toBe('Upgrade to Pro');
    }
  });

  it('never shouts — no exclamation marks anywhere', () => {
    for (const trigger of ['exportBullets', 'addTarget', 'regenerate'] as const) {
      const copy = paywallCopy(trigger, context({ bulletCount: 0, roleTitle: null }));

      expect(`${copy.title} ${copy.body} ${copy.features.join(' ')}`).not.toContain('!');
    }
  });
});
