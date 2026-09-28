/**
 * Every word of the Pro pitch we control, in one place. It reads back what
 * the user has already built — their role, their score, their bullets —
 * because a generic pitch is easy to dismiss and a specific one is not.
 *
 * Pure: hand it a snapshot, get strings. No store, no navigation.
 */

export type PaywallTrigger = 'exportBullets' | 'addTarget' | 'regenerate';

export interface PaywallContext {
  /** The active target's role title, e.g. "Software Engineer". */
  roleTitle: string | null;
  /** 0-100. */
  readiness: number;
  /** Bullets already earned on the active target. */
  bulletCount: number;
  /** How many targets already exist, for the add-target pitch. */
  targetCount: number;
}

export interface PaywallCopy {
  title: string;
  body: string;
  /** Concrete, countable things Pro unlocks for this user right now. */
  features: string[];
  cta: string;
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const towardRole = (roleTitle: string | null): string =>
  roleTitle ? ` toward ${roleTitle}` : '';

const exportCopy = (context: PaywallContext): PaywallCopy => {
  const { bulletCount, readiness, roleTitle } = context;

  // With nothing earned yet there is no progress to name, so the pitch is
  // about what is coming rather than what they would lose.
  const title =
    bulletCount > 0
      ? `Export your ${plural(bulletCount, 'bullet', 'bullets')} in one tap`
      : `Keep your ${readiness}%${towardRole(roleTitle)}`;

  const body =
    bulletCount > 0
      ? `You've earned ${plural(bulletCount, 'CV bullet', 'CV bullets')}${towardRole(roleTitle)}. Pro copies ${bulletCount === 1 ? 'it, and everything you earn next,' : 'all of them'} at once, ready to paste into an application.`
      : `You're ${readiness}% ready${towardRole(roleTitle)}. Finish a milestone and Pro exports every bullet you earn in one tap.`;

  return {
    title,
    body,
    features: [
      bulletCount > 0
        ? `Copy all ${plural(bulletCount, 'bullet', 'bullets')} as one block of text`
        : 'Copy every bullet at once, ready to paste',
      'Unlimited target roles and roadmaps',
      'Rewrite any bullet you are not happy with',
    ],
    cta: 'Upgrade to Pro',
  };
};

const addTargetCopy = (context: PaywallContext): PaywallCopy => {
  const { readiness, roleTitle, targetCount } = context;

  return {
    title: roleTitle ? `Keep your ${readiness}%${towardRole(roleTitle)}` : 'Aim at more than one role',
    body: roleTitle
      ? `Your ${roleTitle} roadmap stays exactly as it is. Pro adds a second target with its own roadmap, score and CV bullets, so you can chase both without starting over.`
      : 'Pro lets you run more than one target role at a time, each with its own roadmap, score and CV bullets.',
    features: [
      targetCount > 0
        ? `Add a second target alongside your ${plural(targetCount, 'current roadmap', 'current roadmaps')}`
        : 'Run several target roles at once',
      'Export every bullet at once, ready to paste',
      'Rewrite any bullet you are not happy with',
    ],
    cta: 'Upgrade to Pro',
  };
};

const regenerateCopy = (context: PaywallContext): PaywallCopy => {
  const { roleTitle, bulletCount } = context;

  return {
    title: roleTitle ? `Rebuild your ${roleTitle} roadmap` : 'Rebuild your roadmap',
    body: `Regenerating writes a fresh set of milestones from your current experience. Everything you have already finished${
      bulletCount > 0 ? `, and the ${plural(bulletCount, 'CV bullet', 'CV bullets')} it earned,` : ''
    } stays put.`,
    features: [
      'Regenerate a roadmap whenever your experience changes',
      'Unlimited target roles and roadmaps',
      'Export every bullet at once, ready to paste',
    ],
    cta: 'Upgrade to Pro',
  };
};

export const paywallCopy = (trigger: PaywallTrigger, context: PaywallContext): PaywallCopy => {
  if (trigger === 'addTarget') return addTargetCopy(context);
  if (trigger === 'regenerate') return regenerateCopy(context);
  return exportCopy(context);
};
