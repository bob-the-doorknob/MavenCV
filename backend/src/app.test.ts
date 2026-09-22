import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp as createProductionApp, type AppDependencies } from './app.js';
import {
  CvBulletGenerationError,
  type CvBulletInput,
  type CvBulletResult,
} from './services/cvBullet.js';
import { RoadmapGenerationError } from './services/roadmap.js';
import { AuthenticationError } from './security/auth.js';
import { QuotaStoreError } from './security/rateLimit.js';

const createApp = (dependencies: AppDependencies = {}) => createProductionApp({
  authenticate: async () => ({ uid: 'user-1' }),
  consumeQuota: async () => ({ allowed: true }),
  ...dependencies,
});

describe('Trajectory backend', () => {
  it('extracts CV experience through an authenticated, quota-limited route', async () => {
    const response = await request(createApp({ generateCvProfile: async () => ({ experience: 'Built a Python project.', questions: [] }) }))
      .post('/api/cv-profile').set('Authorization', 'Bearer token')
      .send({ pdfBase64: Buffer.from('%PDF-1.7\n%%EOF').toString('base64'), targetRoleId: 'quant' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ experience: 'Built a Python project.', questions: [] });
  });

  it('accepts a PDF request larger than the small JSON limit', async () => {
    const pdf = Buffer.from(`%PDF-1.7\n${'x'.repeat(40_000)}\n%%EOF`).toString('base64');
    const response = await request(createApp({ generateCvProfile: async () => ({ experience: 'Built a project.', questions: [] }) }))
      .post('/api/cv-profile').send({ pdfBase64: pdf, targetRoleId: 'software-engineer' });
    expect(response.status).toBe(200);
  });

  it('returns a JSON error for a PDF request over the body limit', async () => {
    const response = await request(createApp()).post('/api/cv-profile').send({
      pdfBase64: Buffer.alloc(2_500_000, 1).toString('base64'), targetRoleId: 'quant',
    });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('REQUEST_TOO_LARGE');
  });

  it('rejects an invalid CV before quota use', async () => {
    let quotaCalls = 0;
    const response = await request(createApp({ consumeQuota: async () => { quotaCalls += 1; return { allowed: true }; } }))
      .post('/api/cv-profile').send({ pdfBase64: 'wrong', targetRoleId: 'quant' });
    expect(response.status).toBe(400);
    expect(quotaCalls).toBe(0);
  });

  it('applies the shared quota to CV extraction', async () => {
    let generationCalls = 0;
    const response = await request(createApp({
      consumeQuota: async () => ({ allowed: false, retryAfterSeconds: 12 }),
      generateCvProfile: async () => { generationCalls += 1; return { experience: 'Unreachable', questions: [] }; },
    })).post('/api/cv-profile').send({
      pdfBase64: Buffer.from('%PDF-1.7\n%%EOF').toString('base64'), targetRoleId: 'quant',
    });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('12');
    expect(generationCalls).toBe(0);
  });

  it('serves the grouped tech role catalog without AI quota', async () => {
    const response = await request(createApp({ consumeQuota: async () => { throw new Error('should not be called'); } })).get('/api/roles');
    expect(response.status).toBe(200);
    expect(response.body.categories).toHaveLength(4);
    const roles: { id: string; title: string }[] = response.body.categories.flatMap((category: { roles: { id: string; title: string }[] }) => category.roles);
    expect(roles.map((role) => role.id)).toEqual([
      'software-engineer', 'frontend-mobile', 'backend-cloud', 'devops-sre', 'cybersecurity', 'embedded-hardware',
      'data-scientist', 'ml-ai-engineer', 'data-analyst', 'product-manager', 'ui-ux',
      'business-analyst', 'quant', 'growth-marketing',
    ]);
    expect(roles.find((role) => role.id === 'quant')?.title).toBe('Quant / Trading');
    expect(JSON.stringify(response.body)).not.toContain('guidance');
  });

  it('reports service health', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'trajectory-backend',
    });
  });

  it('generates an authenticated roadmap with the agreed contract', async () => {
    const titles = [
      'Build 3 REST endpoints for payments',
      'Deploy 1 service for reliability',
      'Design 2 schemas for persistence',
      'Implement 20 tests for API quality',
      'Publish 1 dashboard for service health',
      'Validate 2 drills for recovery',
    ];
    const tasks = titles.map((title, index) => ({
      id: `task-${index + 1}`, title, weight: index < 4 ? 17 : 16, status: 'not_started' as const,
    }));
    const response = await request(createApp({ generateRoadmap: async () => ({ tasks }) }))
      .post('/api/roadmap').set('Authorization', 'Bearer token')
      .send({ experience: 'Built two APIs', targetRole: { title: 'Backend Engineer' } });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tasks });
  });

  it('authenticates before input validation or quota use', async () => {
    let quotaCalls = 0;
    const response = await request(createApp({
      authenticate: async () => { throw new AuthenticationError('bad token'); },
      consumeQuota: async () => { quotaCalls += 1; return { allowed: true }; },
    })).post('/api/roadmap').send({});
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(quotaCalls).toBe(0);
  });

  it('rejects bad roadmap input without quota use', async () => {
    let quotaCalls = 0;
    const response = await request(createApp({
      consumeQuota: async () => { quotaCalls += 1; return { allowed: true }; },
    })).post('/api/roadmap').send({ targetRole: { title: 'Engineer' } });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ROADMAP_INPUT');
    expect(quotaCalls).toBe(0);
  });

  it('shares a rejecting quota with CV generation', async () => {
    let generationCalls = 0;
    const response = await request(createApp({
      consumeQuota: async () => ({ allowed: false, retryAfterSeconds: 55 }),
      generateCvBullet: async () => { generationCalls += 1; return { bullet: 'unreachable' }; },
    })).post('/api/cv-bullet').send({ taskTitle: 'Build API', notes: 'Built 2 APIs' });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('55');
    expect(generationCalls).toBe(0);
  });

  it('maps quota failure and invalid model output safely', async () => {
    const body = { experience: 'Built two APIs', targetRole: { title: 'Backend Engineer' } };
    const unavailable = await request(createApp({ consumeQuota: async () => { throw new QuotaStoreError('database secret'); } })).post('/api/roadmap').send(body);
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(unavailable.body)).not.toContain('database secret');
    const failed = await request(createApp({ generateRoadmap: async () => { throw new RoadmapGenerationError('provider secret'); } })).post('/api/roadmap').send(body);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('ROADMAP_GENERATION_FAILED');
    expect(JSON.stringify(failed.body)).not.toContain('provider secret');
  });

  it('generates a CV bullet from normalized role and industry data', async () => {
    let receivedInput: CvBulletInput | undefined;
    const result: CvBulletResult = {
      bullet:
        'Coordinated discharge planning across five departments by implementing standardized handoff protocols.',
      suggestions: ['How much did handoff time or readmissions change?'],
    };
    const response = await request(
      createApp({
        generateCvBullet: async (input) => {
          receivedInput = input;
          return result;
        },
      }),
    )
      .post('/api/cv-bullet')
      .send({
        taskTitle: '  Coordinate discharge planning  ',
        notes: '  Worked with five departments.  ',
        targetRole: '  Nurse  ',
        targetIndustry: '  Healthcare  ',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(receivedInput).toEqual({
      taskTitle: 'Coordinate discharge planning',
      notes: 'Worked with five departments.',
      targetRole: 'Nurse',
      targetIndustry: 'Healthcare',
    });
  });

  it('supports role-neutral generation without guessing targeting fields', async () => {
    let receivedInput: CvBulletInput | undefined;
    const response = await request(
      createApp({
        generateCvBullet: async (input) => {
          receivedInput = input;
          return { bullet: 'Organized a community event by coordinating volunteers.' };
        },
      }),
    )
      .post('/api/cv-bullet')
      .send({
        taskTitle: 'Organize a community event',
        notes: 'Coordinated volunteers.',
        targetRole: ' ',
        targetIndustry: 'Healthcare',
      });

    expect(response.status).toBe(200);
    expect(receivedInput).toEqual({
      taskTitle: 'Organize a community event',
      notes: 'Coordinated volunteers.',
    });
  });

  it.each([
    [
      'whitespace-only notes',
      { taskTitle: 'Valid title', notes: ' ' },
      'notes is required',
    ],
    [
      'a non-string role',
      { taskTitle: 'Valid title', notes: 'Valid notes', targetRole: 42 },
      'targetRole must be a string',
    ],
    [
      'control characters',
      { taskTitle: 'Valid title', notes: 'Invalid\u0000notes' },
      'notes contains unsupported control characters',
    ],
    ['a null body', null, 'CV bullet request must be an object'],
    ['an array body', [], 'CV bullet request must be an object'],
  ])('rejects %s before generation', async (_name, body, message) => {
    let callCount = 0;
    const response = await request(
      createApp({
        generateCvBullet: async () => {
          callCount += 1;
          return { bullet: 'Implemented an unreachable result.' };
        },
      }),
    )
      .post('/api/cv-bullet')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_CV_BULLET_INPUT',
        message,
      },
    });
    expect(callCount).toBe(0);
  });

  it('returns the API error envelope for malformed JSON', async () => {
    let callCount = 0;
    const response = await request(
      createApp({
        generateCvBullet: async () => {
          callCount += 1;
          return { bullet: 'Implemented an unreachable result.' };
        },
      }),
    )
      .post('/api/cv-bullet')
      .set('Content-Type', 'application/json')
      .send('{"taskTitle":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON.',
      },
    });
    expect(callCount).toBe(0);
  });

  it('maps invalid Gemini output to a safe gateway error', async () => {
    const response = await request(
      createApp({
        generateCvBullet: async () => {
          throw new CvBulletGenerationError('raw provider output: secret detail');
        },
      }),
    )
      .post('/api/cv-bullet')
      .send({ taskTitle: 'Valid title', notes: 'Valid notes' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: 'CV_BULLET_GENERATION_FAILED',
        message: 'Unable to generate a valid CV bullet.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret detail');
  });

  it('maps unexpected failures to a generic internal error', async () => {
    const response = await request(
      createApp({
        generateCvBullet: async () => {
          throw new Error('database or provider detail');
        },
      }),
    )
      .post('/api/cv-bullet')
      .send({ taskTitle: 'Valid title', notes: 'Valid notes' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('database or provider detail');
  });
});
