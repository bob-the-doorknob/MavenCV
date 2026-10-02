/**
 * What the Settings screen may show about accounts and sync. The rule: never
 * advertise something this build cannot do, and never show a row that looks
 * pressable and does nothing.
 *
 * A production build today has the "unavailable" Google stub and no account,
 * so it shows neither the Account section nor the Sync section. Both stay for
 * anything that can actually work: a build with a usable provider (the mock
 * in development), the dev simulate switch, or an account that already exists.
 */
export interface AccountUiInput {
  providerAvailable: boolean;
  hasAccount: boolean;
  /** isLinkedAccount(): a real account or the dev simulation. */
  linked: boolean;
  /** canSimulateLinkedAccount(): development build in mock mode. */
  devSimulation: boolean;
  /** The saved account could not be read; there may be an account we cannot see. */
  accountReadFailed?: boolean;
}

export const accountUiVisibility = (input: AccountUiInput): { showAccount: boolean; showSync: boolean } => {
  const visible = input.providerAvailable || input.hasAccount || input.linked || input.devSimulation;
  // A failed read must be visible even in a build with no sign-in, or a
  // signed-in user would see their account and sync silently vanish.
  return { showAccount: visible || input.accountReadFailed === true, showSync: visible };
};

export interface AccountRowInput {
  account: { email?: string; needsReauth: boolean } | null;
  providerAvailable: boolean;
  linking: boolean;
  accountReadFailed?: boolean;
}

export interface AccountRowModel {
  title: string;
  subtitle: string;
  /** 'link' and 'retryRead' make the row pressable. Null means information only: no chevron, no press. */
  action: 'link' | 'retryRead' | null;
}

/** Null means "show no row at all". */
export const accountRowModel = ({ account, providerAvailable, linking, accountReadFailed }: AccountRowInput): AccountRowModel | null => {
  if (accountReadFailed && !account) {
    return {
      title: "Couldn't load your account",
      subtitle: "This phone couldn't read your sign-in, so sync is paused. Everything on this phone is safe. Tap to try again.",
      action: 'retryRead',
    };
  }
  if (account?.needsReauth) {
    return providerAvailable
      ? {
          title: 'Sign in again',
          subtitle: 'Your Google session ended. Everything on this phone is kept; sync is paused.',
          action: 'link',
        }
      : {
          title: 'Session ended',
          subtitle: "Sign-in isn't available in this build. Everything on this phone is kept; sync is paused.",
          action: null,
        };
  }
  if (account) {
    return { title: 'Signed in with Google', subtitle: account.email ?? 'Your Google account', action: null };
  }
  if (!providerAvailable) return null;
  return {
    title: 'Continue with Google',
    subtitle: linking ? 'Signing in' : 'Keep your roadmap and CV bullets on all your devices.',
    action: 'link',
  };
};
