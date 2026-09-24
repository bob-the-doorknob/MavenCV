import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
beforeEach(() => { vi.resetModules(); storage.getItem.mockReset().mockResolvedValue(null); storage.setItem.mockReset().mockResolvedValue(undefined); });

describe('versioned AI consent', () => {
  it.each([null, '{broken', '{}', '{"version":0,"acceptedAt":"2026-09-24"}', '{"version":1,"acceptedAt":null}'])('defaults off for %s', async (raw) => {
    storage.getItem.mockResolvedValue(raw);
    const consent = await import('./privacy');
    expect(consent.hasAiConsent()).toBe(false);
    await consent.loadConsent();
    expect(consent.hasAiConsent()).toBe(false);
  });
  it('persists explicit consent and restores it across a restart', async () => {
    let consent = await import('./privacy');
    await consent.setAiConsent(true);
    expect(consent.hasAiConsent()).toBe(true);
    const saved = storage.setItem.mock.calls[0]?.[1];
    storage.getItem.mockResolvedValue(saved);
    vi.resetModules(); consent = await import('./privacy');
    await consent.loadConsent();
    expect(consent.hasAiConsent()).toBe(true);
  });
  it('withdraws before persistence completes and does not delete product data', async () => {
    const consent = await import('./privacy');
    await consent.setAiConsent(true);
    let complete!: () => void;
    storage.setItem.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const withdrawing = consent.setAiConsent(false);
    await Promise.resolve();
    expect(consent.hasAiConsent()).toBe(false);
    complete(); await withdrawing;
    expect(storage.setItem).toHaveBeenLastCalledWith(consent.CONSENT_KEY, JSON.stringify({ version: consent.CONSENT_VERSION, acceptedAt: null }));
  });
  it('does not enable consent if saving fails', async () => {
    const consent = await import('./privacy');
    storage.setItem.mockRejectedValue(new Error('disk full'));
    await consent.setAiConsent(true);
    expect(consent.hasAiConsent()).toBe(false);
    expect(consent.useConsent.getState().error).toBeTruthy();
  });
});
