import { describe, expect, it } from 'vitest';

import { createFirestoreRateLimiter, QuotaStoreError, readRateLimitConfig, type StoredQuota } from './rateLimit.js';

class FakeQuotaStore {
  public record: StoredQuota | undefined;
  public path: string | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  public runTransaction<T>(operation: (transaction: {
    get: (path: string) => Promise<StoredQuota | undefined>;
    set: (path: string, value: StoredQuota) => void;
  }) => Promise<T>): Promise<T> {
    const work = this.tail.then(() => operation({
      get: async (path) => { this.path = path; return this.record; },
      set: (path, value) => { this.path = path; this.record = value; },
    }));
    this.tail = work.catch(() => undefined);
    return work;
  }
}

describe('AI quota', () => {
  it('caps rotating users globally without consuming a denied user slot', async () => {
    const records = new Map<string, StoredQuota>();
    const consume = createFirestoreRateLimiter({
      store: { runTransaction: async (operation) => operation({ get: async (path) => records.get(path), set: (path, quota) => { records.set(path, quota); } }) },
      config: { maxRequests: 10, windowSeconds: 60 },
      globalLimits: [{ maxRequests: 2, windowSeconds: 86400 }], now: () => 125000,
    });
    expect((await consume('a')).allowed).toBe(true);
    expect((await consume('b')).allowed).toBe(true);
    expect((await consume('c')).allowed).toBe(false);
    expect(records.has('_internal_ai_rate_limits/c')).toBe(false);
  });
  it('validates configuration once', () => {
    expect(readRateLimitConfig({})).toEqual({ maxRequests: 10, windowSeconds: 60 });
    expect(readRateLimitConfig({ AI_RATE_LIMIT_MAX_REQUESTS: '4', AI_RATE_LIMIT_WINDOW_SECONDS: '30' })).toEqual({ maxRequests: 4, windowSeconds: 30 });
    for (const invalid of ['0', '-1', '1.5', 'wat', '10001']) {
      expect(() => readRateLimitConfig({ AI_RATE_LIMIT_MAX_REQUESTS: invalid })).toThrow();
    }
    expect(() => readRateLimitConfig({ AI_RATE_LIMIT_WINDOW_SECONDS: '3601' })).toThrow();
  });

  it('applies fixed windows and records only quota fields', async () => {
    const store = new FakeQuotaStore();
    store.record = { windowStartedAtMs: 120_000, count: 9, expiresAtMs: 240_000 };
    const consume = createFirestoreRateLimiter({ store, now: () => 125_000, config: { maxRequests: 10, windowSeconds: 60 } });
    expect(await consume('user-1')).toEqual({ allowed: true });
    expect(await consume('user-1')).toEqual({ allowed: false, retryAfterSeconds: 55 });
    expect(store.path).toBe('_internal_ai_rate_limits/user-1');
    expect(store.record).toEqual({ windowStartedAtMs: 120_000, count: 10, expiresAtMs: 240_000 });
  });

  it('allows exactly one concurrent request at the last slot', async () => {
    const store = new FakeQuotaStore();
    store.record = { windowStartedAtMs: 120_000, count: 9, expiresAtMs: 240_000 };
    const consume = createFirestoreRateLimiter({ store, now: () => 125_000, config: { maxRequests: 10, windowSeconds: 60 } });
    const decisions = await Promise.all([consume('user-1'), consume('user-1')]);
    expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(1);
  });

  it('resets expired windows and fails closed on store errors', async () => {
    const store = new FakeQuotaStore();
    store.record = { windowStartedAtMs: 60_000, count: 10, expiresAtMs: 180_000 };
    const consume = createFirestoreRateLimiter({ store, now: () => 125_000, config: { maxRequests: 10, windowSeconds: 60 } });
    expect(await consume('user-1')).toEqual({ allowed: true });
    expect(store.record?.count).toBe(1);
    await expect(consume('')).rejects.toBeInstanceOf(QuotaStoreError);
    const broken = createFirestoreRateLimiter({ store: { runTransaction: async () => { throw new Error('secret'); } }, now: () => 125_000, config: { maxRequests: 10, windowSeconds: 60 } });
    await expect(broken('user-1')).rejects.toThrow('AI quota is temporarily unavailable');
  });
});
