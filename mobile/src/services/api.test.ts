import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, extractProfile, generateRoadmap, mapCvBulletResponse, mapRoadmapResponse } from './api';

describe('mapRoadmapResponse', () => {
  it('fills safe defaults for fields the backend does not send yet', () => {
    const result = mapRoadmapResponse({
      tasks: [{ id: 't1', title: 'Build 1 thing', weight: 34, status: 'not_started' }],
    });

    expect(result).toEqual([
      {
        id: 't1',
        title: 'Build 1 thing',
        doneWhen: '',
        steps: [],
        estimatedWeeks: 2,
        priority: 2,
        status: 'not_started',
      },
    ]);
  });

  it('maps estimatedWeeks from the backend, clamped to 1-8', () => {
    const result = mapRoadmapResponse({
      tasks: [
        { id: 't1', title: 'Short', estimatedWeeks: 1 },
        { id: 't2', title: 'Long', estimatedWeeks: 99 },
        { id: 't3', title: 'Too short', estimatedWeeks: 0 },
        { id: 't4', title: 'Fractional', estimatedWeeks: 3.6 },
        { id: 't5', title: 'Nonsense', estimatedWeeks: 'six' },
      ],
    });

    expect(result.map((task) => task.estimatedWeeks)).toEqual([1, 8, 1, 4, 2]);
  });

  it('omits why and returns no steps when the backend sends neither', () => {
    const [mapped] = mapRoadmapResponse({ tasks: [{ id: 't1', title: 'Build 1 thing' }] });

    expect(mapped?.steps).toEqual([]);
    expect(mapped).not.toHaveProperty('why');
  });

  it('maps why and turns step strings into steps with generated ids', () => {
    const [mapped] = mapRoadmapResponse({
      tasks: [
        {
          id: 't1',
          title: 'Build 1 thing',
          why: '  Recruiters screen for finished work.  ',
          steps: ['Set up the repository', '  Write the README  '],
        },
      ],
    });

    expect(mapped?.why).toBe('Recruiters screen for finished work.');
    expect(mapped?.steps).toEqual([
      { id: expect.any(String), title: 'Set up the repository', done: false },
      { id: expect.any(String), title: 'Write the README', done: false },
    ]);
    expect(mapped?.steps[0]?.id).not.toBe(mapped?.steps[1]?.id);
  });

  it('ignores a blank why and non-string or empty steps', () => {
    const [mapped] = mapRoadmapResponse({
      tasks: [{ id: 't1', title: 'Build 1 thing', why: '   ', steps: ['Keep this', 42, '', null] }],
    });

    expect(mapped).not.toHaveProperty('why');
    expect(mapped?.steps).toEqual([{ id: expect.any(String), title: 'Keep this', done: false }]);
  });

  it('returns no steps when steps is not an array', () => {
    const [mapped] = mapRoadmapResponse({ tasks: [{ id: 't1', title: 'Build 1 thing', steps: 'nope' }] });

    expect(mapped?.steps).toEqual([]);
  });

  it('maps every task in the array', () => {
    const result = mapRoadmapResponse({
      tasks: [
        { id: 't1', title: 'Build 1 thing' },
        { id: 't2', title: 'Ship 2 things' },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ id: 't2', title: 'Ship 2 things' });
  });

  it('throws an invalid_response ApiError when tasks is missing', () => {
    expect.assertions(2);
    try {
      mapRoadmapResponse({});
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('invalid_response');
    }
  });

  it('throws an invalid_response ApiError when a task is missing an id or title', () => {
    expect(() => mapRoadmapResponse({ tasks: [{ title: 'no id' }] })).toThrow(ApiError);
  });
});

describe('mapCvBulletResponse', () => {
  it('renames bullet to text and keeps suggestions', () => {
    expect(mapCvBulletResponse({ bullet: 'Built 1 thing.', suggestions: ['Add a metric.'] })).toEqual({
      text: 'Built 1 thing.',
      suggestions: ['Add a metric.'],
    });
  });

  it('omits suggestions when the backend sent none', () => {
    expect(mapCvBulletResponse({ bullet: 'Built 1 thing.' })).toEqual({ text: 'Built 1 thing.' });
  });

  it('throws an invalid_response ApiError for a missing bullet', () => {
    expect.assertions(2);
    try {
      mapCvBulletResponse({});
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('invalid_response');
    }
  });
});

describe('generateRoadmap (real mode) error mapping', () => {
  const roadmapInput = { roleId: 'software-engineer', level: 'internship' as const, experience: 'Built 1 app.' };

  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps HTTP 429 to rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));

    await expect(generateRoadmap(roadmapInput)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('maps a 5xx status to server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));

    await expect(generateRoadmap(roadmapInput)).rejects.toMatchObject({ kind: 'server' });
  });

  it.each([401, 403])('maps HTTP %i to auth', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }));

    await expect(generateRoadmap(roadmapInput)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps unparsable JSON to invalid_response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('bad json');
        },
      }),
    );

    await expect(generateRoadmap(roadmapInput)).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});

describe('extractProfile (mock mode)', () => {
  const file = { uri: 'file:///tmp/cv.pdf', name: 'cv.pdf' };
  const EXPERIENCE_MIN_SAMPLE_LENGTH = 100;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'true');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('returns a non-empty, role-tailored sample after the mock delay', async () => {
    const promise = extractProfile(file, 'software-engineer');
    await vi.advanceTimersByTimeAsync(2_000);

    const result = await promise;
    expect(result.experienceText.length).toBeGreaterThan(EXPERIENCE_MIN_SAMPLE_LENGTH);
    expect(result.experienceText).toContain('Computer Science');
  });

  it('returns different text for a different role', async () => {
    const promiseA = extractProfile(file, 'software-engineer');
    await vi.advanceTimersByTimeAsync(2_000);
    const resultA = await promiseA;

    const promiseB = extractProfile(file, 'ui-ux');
    await vi.advanceTimersByTimeAsync(2_000);
    const resultB = await promiseB;

    expect(resultA.experienceText).not.toBe(resultB.experienceText);
  });

  it('falls back to a generic sample for an unknown or missing role', async () => {
    const promise = extractProfile(file);
    await vi.advanceTimersByTimeAsync(2_000);

    const result = await promise;
    expect(result.experienceText.length).toBeGreaterThan(EXPERIENCE_MIN_SAMPLE_LENGTH);
  });

  it('throws the configured ApiError kind when EXPO_PUBLIC_MOCK_FAIL is set', async () => {
    vi.stubEnv('EXPO_PUBLIC_MOCK_FAIL', 'server');

    const promise = extractProfile(file, 'software-engineer');
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'server' });
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});
