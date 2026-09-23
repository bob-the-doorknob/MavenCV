import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
import { generateRoadmap, mapRoadmapResponse } from './api';
import { normalizeRoadmapInput } from '../../../backend/src/services/roadmap';
import { calculateReadiness } from '../utils/readiness';
import { rolePresets } from '../data/roles';
import { publicTargetRoleCategories } from '../../../backend/src/data/targets';

it('keeps the offline role catalog aligned with backend IDs and labels', () => {
  expect(rolePresets.map(({ id, title }) => ({ id, title }))).toEqual(publicTargetRoleCategories.flatMap((category) => category.roles));
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('sends a real mobile request accepted by the actual backend normalizer', async () => {
  vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false');
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://example.test');
  let received: unknown;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    received = normalizeRoadmapInput(JSON.parse(String(init.body)));
    return { ok: true, json: async () => ({ tasks: [] }) };
  });
  await generateRoadmap({ roleId: 'software-engineer', level: 'entry-level', experience: 'Built APIs.\nUsed SQL.' });
  expect(received).toMatchObject({ level: 'entry-level', experience: 'Built APIs.\nUsed SQL.' });
});

it('preserves generated metadata and unequal backend scoring weights', () => {
  const tasks = mapRoadmapResponse({ tasks: [
    { id: 'a', title: 'Build 1 API', weight: 75, doneWhen: 'API deployed', why: 'Proof of delivery', steps: ['Test it'], estimatedWeeks: 4, priority: 3 },
    { id: 'b', title: 'Publish 1 report', weight: 25, priority: 1 },
  ] });
  expect(tasks[0]).toMatchObject({ weight: 75, doneWhen: 'API deployed', priority: 3 });
  expect(calculateReadiness(tasks.map((task, index) => ({ ...task, status: index === 0 ? 'done' : 'not_started' })))).toBe(75);
});
