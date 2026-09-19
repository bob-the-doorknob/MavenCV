import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import {
  CvBulletGenerationError,
  type CvBulletInput,
  type CvBulletResult,
} from './services/cvBullet.js';

describe('Trajectory backend', () => {
  it('reports service health', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'trajectory-backend',
    });
  });

  it('keeps roadmap generation deliberately unimplemented', async () => {
    const response = await request(createApp()).post('/api/roadmap').send({});

    expect(response.status).toBe(501);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'This AI endpoint is reserved for a later implementation phase.',
      },
    });
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
