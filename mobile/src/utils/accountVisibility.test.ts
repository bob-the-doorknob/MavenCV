import { describe, expect, it } from 'vitest';

import { accountRowModel, accountUiVisibility } from './accountVisibility';

const none = { providerAvailable: false, hasAccount: false, linked: false, devSimulation: false };

describe('accountUiVisibility', () => {
  it('hides the Account and Sync sections in a production build: stub provider, no account', () => {
    expect(accountUiVisibility(none)).toEqual({ showAccount: false, showSync: false });
  });

  it.each([
    ['a usable provider (the mock in development)', { providerAvailable: true }],
    ['the dev simulate switch being available', { devSimulation: true }],
    ['a linked account', { hasAccount: true, linked: true }],
    ['an account whose session ended, even with no provider', { hasAccount: true }],
    ['a linked state with no stored account', { linked: true }],
  ])('shows both for %s', (_label, patch) => {
    expect(accountUiVisibility({ ...none, ...patch })).toEqual({ showAccount: true, showSync: true });
  });
});

describe('accountRowModel', () => {
  const base = { account: null, providerAvailable: true, linking: false };

  it('offers Continue with Google only when it can work', () => {
    expect(accountRowModel(base)).toMatchObject({ title: 'Continue with Google', action: 'link' });
    expect(accountRowModel({ ...base, providerAvailable: false })).toBeNull();
  });

  it('shows the email on a signed-in account, with nothing to press', () => {
    expect(accountRowModel({ ...base, account: { email: 'a@b.c', needsReauth: false } })).toEqual({
      title: 'Signed in with Google',
      subtitle: 'a@b.c',
      action: null,
    });
  });

  it('offers re-sign-in only when a provider exists; otherwise states it, without a press', () => {
    const ended = { ...base, account: { needsReauth: true } };
    expect(accountRowModel(ended)).toMatchObject({ title: 'Sign in again', action: 'link' });
    expect(accountRowModel({ ...ended, providerAvailable: false })).toMatchObject({ action: null });
  });

  it('never produces a pressable row without a way to complete it', () => {
    for (const providerAvailable of [true, false]) {
      for (const account of [null, { needsReauth: false }, { needsReauth: true }]) {
        const row = accountRowModel({ account, providerAvailable, linking: false });
        if (row?.action === 'link') expect(providerAvailable).toBe(true);
      }
    }
  });
});

describe('an account that could not be read', () => {
  it('shows the Account section even in a build with no sign-in', () => {
    expect(accountUiVisibility({ ...none, accountReadFailed: true })).toEqual({ showAccount: true, showSync: false });
  });

  it('says so, and offers a retry rather than looking signed out', () => {
    const row = accountRowModel({ account: null, providerAvailable: false, linking: false, accountReadFailed: true });
    expect(row).toMatchObject({ title: "Couldn't load your account", action: 'retryRead' });
    expect(row?.subtitle).toContain('safe');
  });
});
