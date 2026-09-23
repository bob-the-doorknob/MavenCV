import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ getAuthToken: async () => 'test-id-token' }));

import {
  ApiError,
  extractProfile,
  fetchRoleCatalog,
  generateCvBullet,
  generateRoadmap,
  mapCvBulletResponse,
  mapRoadmapResponse,
} from './api';

/** Captures the single fetch call a request makes. */
const stubFetch = (response: Partial<Response> & { json: () => Promise<unknown> }) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;

describe('mapRoadmapResponse', () => {
  it('fills safe defaults for fields the backend does not send yet', () => {
    const result = mapRoadmapResponse({
      tasks: [{ id: 't1', title: 'Build 1 thing', weight: 34, status: 'not_started' }],
    });

    expect(result).toEqual([
      {
        id: 't1',
        title: 'Build 1 thing',
        weight: 34,
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
  const file = { pdfBase64: 'JVBERi0xLjQK' };
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

describe('real-mode request contracts', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the auth token on AI requests', async () => {
    const fetchMock = stubFetch({ json: async () => ({ tasks: [] }) });

    await generateRoadmap({ roleId: 'software-engineer', level: 'internship', experience: 'Built APIs.' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/roadmap',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-id-token' }),
      }),
    );
  });

  it('sends experience unchanged and level as an explicit field', async () => {
    const fetchMock = stubFetch({ json: async () => ({ tasks: [] }) });

    await generateRoadmap({
      roleId: 'software-engineer',
      level: 'internship',
      employer: 'Example Corp',
      experience: 'Built APIs.',
    });

    const body = bodyOf(fetchMock);
    expect(body).toEqual({
      experience: expect.stringContaining('Built APIs.'),
      level: 'internship',
      targetRole: { id: 'software-engineer', title: 'Software Engineer', employer: 'Example Corp' },
    });
    expect(body.experience).toBe('Built APIs.');
  });

  it('omits targetRole.id for a custom role, since the backend would reject it', async () => {
    const fetchMock = stubFetch({ json: async () => ({ tasks: [] }) });

    await generateRoadmap({
      roleId: 'custom',
      customTitle: 'Robotics Engineer',
      level: 'entry-level',
      experience: 'Built robots.',
    });

    const targetRole = bodyOf(fetchMock).targetRole as Record<string, unknown>;
    expect(targetRole).not.toHaveProperty('id');
    expect(targetRole.title).toBe('Robotics Engineer');
  });

  it('sends the CV bullet body normalizeCvBulletInput accepts, dropping level', async () => {
    const fetchMock = stubFetch({ json: async () => ({ bullet: 'Built 1 thing.' }) });

    await generateCvBullet({
      taskTitle: 'Build 1 API',
      notes: 'Shipped 5 endpoints.',
      roleTitle: 'Software Engineer',
      level: 'internship',
    });

    expect(bodyOf(fetchMock)).toEqual({
      taskTitle: 'Build 1 API',
      notes: 'Shipped 5 endpoints.',
      targetRole: 'Software Engineer',
    });
  });

  it('posts the CV profile as base64 to /api/cv-profile and returns questions', async () => {
    const fetchMock = stubFetch({
      json: async () => ({ experience: 'Built APIs.', questions: ['Which database?'] }),
    });

    const result = await extractProfile({ pdfBase64: 'JVBERi0xLjQK' }, 'software-engineer');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/api/cv-profile');
    expect(bodyOf(fetchMock)).toEqual({ pdfBase64: 'JVBERi0xLjQK', targetRoleId: 'software-engineer' });
    expect(result).toEqual({ experienceText: 'Built APIs.', questions: ['Which database?'] });
  });

  it('refuses a CV upload for a role the backend does not know', async () => {
    stubFetch({ json: async () => ({}) });

    await expect(extractProfile({ pdfBase64: 'JVBERi0xLjQK' }, 'custom')).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('loads the role catalog without an auth header', async () => {
    const fetchMock = stubFetch({ json: async () => ({ categories: [{ id: 'data-ai', title: 'Data & AI', roles: [] }] }) });

    await expect(fetchRoleCatalog()).resolves.toEqual([{ id: 'data-ai', title: 'Data & AI', roles: [] }]);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/roles');
  });
});

describe('backend error codes map to ApiError kinds', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const roadmapInput = { roleId: 'software-engineer', level: 'internship' as const, experience: 'Built 1 app.' };

  it.each([
    [401, 'AUTHENTICATION_REQUIRED', 'auth'],
    [429, 'RATE_LIMIT_EXCEEDED', 'rate_limited'],
    [502, 'ROADMAP_GENERATION_FAILED', 'server'],
    [502, 'CV_BULLET_GENERATION_FAILED', 'server'],
    [502, 'CV_PROFILE_GENERATION_FAILED', 'server'],
    [503, 'SERVICE_UNAVAILABLE', 'server'],
    [500, 'INTERNAL_ERROR', 'server'],
    [400, 'INVALID_ROADMAP_INPUT', 'invalid_response'],
  ])('maps %i %s to %s', async (status, code, kind) => {
    stubFetch({
      ok: false,
      status,
      json: async () => ({ error: { code, message: 'Backend said no.' } }),
    });

    await expect(generateRoadmap(roadmapInput)).rejects.toMatchObject({ kind });
  });

  it('falls back to the status when the error body is not JSON', async () => {
    stubFetch({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError('not json');
      },
    });

    await expect(generateRoadmap(roadmapInput)).rejects.toMatchObject({ kind: 'server' });
  });
});
