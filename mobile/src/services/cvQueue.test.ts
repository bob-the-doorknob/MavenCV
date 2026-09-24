import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
vi.mock('./appCheck', () => ({ getAppCheckToken: async () => 'test-app-check-token' }));

// The real module reaches for `window`, which doesn't exist under vitest's
// node environment. Persist middleware only needs get/set/remove to resolve.
vi.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: async (key: string) => {
        memory.delete(key);
      },
    },
  };
});

// generateCvBullet is mocked directly (not exercised through mock-mode's
// setTimeout delay), so these tests settle on their own microtask queue —
// there is nothing to wait on, real or fake.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, generateCvBullet: vi.fn() };
});

import type { RoadmapTask } from '../types';
import { useAppStore } from '../store/useAppStore';
import { ApiError, generateCvBullet } from './api';
import { processPendingCvEntries, retryCvEntry, setCvQueueActive } from './cvQueue';

const mockedGenerateCvBullet = vi.mocked(generateCvBullet);

const task = (overrides: Partial<RoadmapTask> = {}): RoadmapTask => ({
  id: 'task-1',
  title: 'Build 1 portfolio project',
  doneWhen: 'Project is deployed and linked from the CV',
  steps: [],
  estimatedWeeks: 2,
  priority: 1,
  status: 'not_started',
  ...overrides,
});

const baseTargetInput = {
  roleId: 'software-engineer',
  level: 'internship' as const,
  experience: 'Two class projects in TypeScript.',
};

/** Seeds `count` pending CV entries via the real store flow (addTarget + completeTask). */
const seedPendingEntries = (count: number): void => {
  const { addTarget, completeTask } = useAppStore.getState();
  addTarget({
    ...baseTargetInput,
    roadmap: Array.from({ length: count }, (_, index) => task({ id: `task-${index}` })),
  });
  for (let index = 0; index < count; index += 1) {
    completeTask(`task-${index}`, `Notes for task ${index}.`);
  }
};

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  setCvQueueActive(true);
  useAppStore.getState().resetAll();
  mockedGenerateCvBullet.mockReset();
});

describe('processPendingCvEntries', () => {
  it('drains newly queued work without losing it during an in-flight request', async () => {
    seedPendingEntries(1);
    const first = deferred<{ text: string }>();
    mockedGenerateCvBullet.mockReturnValueOnce(first.promise).mockResolvedValue({ text: 'Next bullet' });
    const run = processPendingCvEntries();
    const id = useAppStore.getState().addMilestone({ title: 'Build 1 demo', doneWhen: 'Deployed', priority: 2, estimatedWeeks: 1 });
    useAppStore.getState().completeTask(id, 'Deployed a demo');
    first.resolve({ text: 'First bullet' });
    await run;
    expect(useAppStore.getState().cvEntries.every((entry) => entry.status === 'ready')).toBe(true);
    expect(mockedGenerateCvBullet).toHaveBeenCalledTimes(2);
  });
  it('does not start another AI request after leaving the CV screen', async () => {
    seedPendingEntries(2);
    const first = deferred<{ text: string }>();
    mockedGenerateCvBullet.mockReturnValueOnce(first.promise);
    const run = processPendingCvEntries();
    setCvQueueActive(false);
    first.resolve({ text: 'First bullet' });
    await run;
    expect(mockedGenerateCvBullet).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().cvEntries[1]?.status).toBe('pending');
  });
  it('marks an entry ready on success', async () => {
    seedPendingEntries(1);
    mockedGenerateCvBullet.mockResolvedValueOnce({ text: 'Built 1 portfolio project.' });

    await processPendingCvEntries();

    const [entry] = useAppStore.getState().cvEntries;
    expect(entry?.status).toBe('ready');
    expect(entry?.text).toBe('Built 1 portfolio project.');
  });

  it('marks an entry failed on a non-rate-limited error', async () => {
    seedPendingEntries(1);
    mockedGenerateCvBullet.mockRejectedValueOnce(new ApiError('server', 'boom'));

    await processPendingCvEntries();

    const [entry] = useAppStore.getState().cvEntries;
    expect(entry?.status).toBe('failed');
  });

  it('processes entries one at a time, in order', async () => {
    seedPendingEntries(2);
    mockedGenerateCvBullet.mockResolvedValueOnce({ text: 'First bullet.' }).mockResolvedValueOnce({ text: 'Second bullet.' });

    await processPendingCvEntries();

    const { cvEntries } = useAppStore.getState();
    expect(cvEntries.map((entry) => entry.text)).toEqual(['First bullet.', 'Second bullet.']);
    expect(mockedGenerateCvBullet).toHaveBeenNthCalledWith(1, expect.objectContaining({ taskTitle: task({ id: 'task-0' }).title }));
  });

  it('ignores a call made while a run is already in progress', async () => {
    seedPendingEntries(2);
    const first = deferred<{ text: string }>();
    mockedGenerateCvBullet.mockReturnValueOnce(first.promise).mockResolvedValue({ text: 'Second bullet.' });

    const run1 = processPendingCvEntries();
    const run2 = processPendingCvEntries();

    // run2 hit the lock and returned before touching generateCvBullet again.
    expect(mockedGenerateCvBullet).toHaveBeenCalledTimes(1);

    first.resolve({ text: 'First bullet.' });
    await run1;
    await run2;

    expect(mockedGenerateCvBullet).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().cvEntries.every((entry) => entry.status === 'ready')).toBe(true);
  });

  it('stops the whole run on rate_limited, leaving every entry pending', async () => {
    seedPendingEntries(2);
    mockedGenerateCvBullet.mockRejectedValueOnce(new ApiError('rate_limited', 'slow down'));

    await processPendingCvEntries();

    expect(mockedGenerateCvBullet).toHaveBeenCalledTimes(1);
    const { cvEntries } = useAppStore.getState();
    expect(cvEntries.every((entry) => entry.status === 'pending')).toBe(true);
  });
});

describe('retryCvEntry', () => {
  it('keeps all queued entries pending when AI consent is missing', async () => {
    seedPendingEntries(2);
    mockedGenerateCvBullet.mockRejectedValueOnce(new ApiError('consent_required', 'off'));
    await processPendingCvEntries();
    expect(mockedGenerateCvBullet).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().cvEntries.every((entry) => entry.status === 'pending')).toBe(true);
  });
  it('puts a failed entry back to pending and reprocesses it', async () => {
    seedPendingEntries(1);
    mockedGenerateCvBullet.mockRejectedValueOnce(new ApiError('server', 'boom'));
    await processPendingCvEntries();
    expect(useAppStore.getState().cvEntries[0]?.status).toBe('failed');

    mockedGenerateCvBullet.mockResolvedValueOnce({ text: 'Built 1 portfolio project.' });
    retryCvEntry(useAppStore.getState().cvEntries[0]?.id as string);
    // retryCvEntry fires processPendingCvEntries() without awaiting it.
    await Promise.resolve();
    await Promise.resolve();

    expect(useAppStore.getState().cvEntries[0]?.status).toBe('ready');
  });

  it('does nothing for an entry that is not failed', () => {
    seedPendingEntries(1);
    const before = useAppStore.getState().cvEntries[0];

    retryCvEntry(before?.id as string);

    expect(useAppStore.getState().cvEntries[0]).toEqual(before);
    expect(mockedGenerateCvBullet).not.toHaveBeenCalled();
  });
});
