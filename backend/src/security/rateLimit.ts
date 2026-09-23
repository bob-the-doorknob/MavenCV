export interface QuotaDecision { allowed: boolean; retryAfterSeconds?: number }
export type AiRateLimiter = (uid: string) => Promise<QuotaDecision>;
export interface RateLimitConfig { maxRequests: number; windowSeconds: number }
export interface StoredQuota { windowStartedAtMs: number; count: number; expiresAtMs: number }

interface QuotaTransaction {
  get(path: string): Promise<StoredQuota | undefined>;
  set(path: string, quota: StoredQuota): void;
}

export interface QuotaStore {
  runTransaction<T>(operation: (transaction: QuotaTransaction) => Promise<T>): Promise<T>;
}

export class QuotaStoreError extends Error {
  public override readonly name = 'QuotaStoreError';
}

const readPositiveInteger = (value: string | undefined, fallback: number, maximum: number): number => {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/u.test(value)) throw new Error('Invalid AI rate limit configuration');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) throw new Error('Invalid AI rate limit configuration');
  return number;
};

export const readRateLimitConfig = (env: Record<string, string | undefined>): RateLimitConfig => ({
  maxRequests: readPositiveInteger(env.AI_RATE_LIMIT_MAX_REQUESTS, 10, 10_000),
  windowSeconds: readPositiveInteger(env.AI_RATE_LIMIT_WINDOW_SECONDS, 60, 3_600),
});

export const createFirestoreRateLimiter = ({
  store,
  config,
  now = Date.now,
  globalLimits = [],
}: { store: QuotaStore; config: RateLimitConfig; now?: () => number; globalLimits?: RateLimitConfig[] }): AiRateLimiter => async (uid) => {
  if (!uid || uid.includes('/')) throw new QuotaStoreError('AI quota is temporarily unavailable');
  const windowMs = config.windowSeconds * 1000;
  try {
    return await store.runTransaction(async (transaction) => {
      const nowMs = now();
      const windowStartedAtMs = Math.floor(nowMs / windowMs) * windowMs;
      const path = `_internal_ai_rate_limits/${uid}`;
      const existing = await transaction.get(path);
      const globalQuotas = await Promise.all(globalLimits.map(async (limit) => {
        const globalPath = `_internal_ai_global_limits/window-${limit.windowSeconds}`;
        const started = Math.floor(nowMs / (limit.windowSeconds * 1000)) * limit.windowSeconds * 1000;
        const saved = await transaction.get(globalPath);
        return { limit, path: globalPath, started, count: saved?.windowStartedAtMs === started ? saved.count : 0 };
      }));
      for (const quota of globalQuotas) {
        if (quota.count >= quota.limit.maxRequests) return { allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((quota.started + quota.limit.windowSeconds * 1000 - nowMs) / 1000)) };
      }
      const count = existing?.windowStartedAtMs === windowStartedAtMs ? existing.count : 0;
      if (count >= config.maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAtMs + windowMs - nowMs) / 1000)),
        };
      }
      transaction.set(path, { windowStartedAtMs, count: count + 1, expiresAtMs: windowStartedAtMs + 2 * windowMs });
      for (const quota of globalQuotas) transaction.set(quota.path, { windowStartedAtMs: quota.started, count: quota.count + 1, expiresAtMs: quota.started + quota.limit.windowSeconds * 2000 });
      return { allowed: true };
    });
  } catch {
    throw new QuotaStoreError('AI quota is temporarily unavailable');
  }
};

const productionStore: QuotaStore = {
  async runTransaction<T>(operation: (transaction: QuotaTransaction) => Promise<T>): Promise<T> {
    const [{ getApps, getApp, initializeApp }, { getFirestore, Timestamp }] = await Promise.all([
      import('firebase-admin/app'), import('firebase-admin/firestore'),
    ]);
    const app = getApps().length === 0 ? initializeApp() : getApp();
    const firestore = getFirestore(app);
    return firestore.runTransaction(async (transaction) => operation({
      get: async (path) => {
        const snapshot = await transaction.get(firestore.doc(path));
        if (!snapshot.exists) return undefined;
        const data: unknown = snapshot.data();
        if (typeof data !== 'object' || data === null || !('windowStartedAtMs' in data) || !('count' in data)) {
          throw new Error('Invalid quota document');
        }
        const quota = data as { windowStartedAtMs: unknown; count: unknown };
        if (typeof quota.windowStartedAtMs !== 'number' || typeof quota.count !== 'number' ||
          !Number.isSafeInteger(quota.windowStartedAtMs) || !Number.isSafeInteger(quota.count) ||
          quota.windowStartedAtMs < 0 || quota.count < 0) {
          throw new Error('Invalid quota document');
        }
        return { windowStartedAtMs: quota.windowStartedAtMs, count: quota.count, expiresAtMs: 0 };
      },
      set: (path, quota) => {
        transaction.set(firestore.doc(path), {
          windowStartedAtMs: quota.windowStartedAtMs,
          count: quota.count,
          expiresAt: Timestamp.fromMillis(quota.expiresAtMs),
        });
      },
    }));
  },
};

export const consumeAiQuota = createFirestoreRateLimiter({
  store: productionStore,
  config: readRateLimitConfig(process.env),
  globalLimits: [
    { maxRequests: readPositiveInteger(process.env.AI_GLOBAL_REQUESTS_PER_MINUTE, 60, 10000), windowSeconds: 60 },
    { maxRequests: readPositiveInteger(process.env.AI_GLOBAL_REQUESTS_PER_DAY, 1000, 1000000), windowSeconds: 86400 },
  ],
});
