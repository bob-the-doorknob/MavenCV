import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { AppCheckError, createAppCheckVerifier } from './appCheck.js';

describe('App Check verification', () => {
  it.each([undefined, '', 'a b', 'a,b', ['a', 'b'], 'x'.repeat(8193)])('rejects malformed header %s', async (header) => {
    const verify = vi.fn();
    await expect(createAppCheckVerifier(verify, () => ['app'])(header)).rejects.toBeInstanceOf(AppCheckError);
    expect(verify).not.toHaveBeenCalled();
  });
  it('accepts a verified token for an allowlisted app', async () => {
    const verify = vi.fn().mockResolvedValue({ appId: 'app' });
    await createAppCheckVerifier(verify, () => ['app'])('token');
    expect(verify).toHaveBeenCalledWith('token');
  });
  it('rejects other apps and missing configuration', async () => {
    for (const apps of [[], ['other']]) {
      await expect(createAppCheckVerifier(async () => ({ appId: 'app' }), () => apps)('token')).rejects.toBeInstanceOf(AppCheckError);
    }
  });
  it('hides verifier errors including invalid and expired tokens', async () => {
    await expect(createAppCheckVerifier(async () => { throw new Error('secret detail'); }, () => ['app'])('token')).rejects.toThrow('App verification is required.');
  });
  it.each(['roadmap', 'cv-bullet', 'cv-profile'])('blocks %s before auth, quota and generation', async (route) => {
    const authenticate = vi.fn(); const consumeQuota = vi.fn(); const generate = vi.fn();
    const response = await request(createApp({ authenticate, consumeQuota, generateRoadmap: generate, generateCvBullet: generate, generateCvProfile: generate })).post(`/api/${route}`).send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('APP_CHECK_REQUIRED');
    expect(authenticate).not.toHaveBeenCalled(); expect(consumeQuota).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  });
  it('keeps health and role catalog public', async () => {
    expect((await request(createApp()).get('/health')).status).toBe(200);
    expect((await request(createApp()).get('/api/roles')).status).toBe(200);
  });
  it('forwards the header and still requires user authentication after attestation', async () => {
    const attest = vi.fn().mockResolvedValue(undefined);
    const { AuthenticationError } = await import('./auth.js');
    const response = await request(createApp({ attest, authenticate: async () => { throw new AuthenticationError(); } }))
      .post('/api/roadmap').set('X-Firebase-AppCheck', 'verified-token').send({});
    expect(attest).toHaveBeenCalledWith('verified-token');
    expect(response.status).toBe(401);
  });
});
