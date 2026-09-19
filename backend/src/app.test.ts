import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('Trajectory backend', () => {
  it('reports service health', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'trajectory-backend',
    });
  });

  it.each(['/api/roadmap', '/api/cv-bullet'])(
    'marks POST %s as deliberately unimplemented',
    async (path) => {
      const response = await request(createApp()).post(path).send({});

      expect(response.status).toBe(501);
      expect(response.body).toEqual({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'This AI endpoint is reserved for a later implementation phase.',
        },
      });
    },
  );
});
