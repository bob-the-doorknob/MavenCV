import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, generateRoadmap, mapCvBulletResponse, mapRoadmapResponse } from './api';

describe('mapRoadmapResponse', () => {
  it('fills safe defaults for fields the backend does not send yet', () => {
    const result = mapRoadmapResponse({
      tasks: [{ id: 't1', title: 'Build 1 thing', weight: 34, status: 'not_started' }],
    });

    expect(result).toEqual([{ id: 't1', title: 'Build 1 thing', doneWhen: '', priority: 2, status: 'not_started' }]);
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
