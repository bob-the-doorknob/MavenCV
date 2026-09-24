import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDependencies } from '../app.js';
import { ProviderRateLimitError } from '../services/gemini.js';
import { QuotaStoreError } from '../security/rateLimit.js';

const output: string[] = [];
const app = (overrides: AppDependencies = {}) => createApp({
  attest: async () => undefined,
  authenticate: async () => ({ uid: 'PRIVATE_USER_ID' }),
  consumeQuota: async () => ({ allowed: true }),
  generateCvBullet: async () => ({ bullet: 'PRIVATE_GENERATED_CONTENT' }),
  ...overrides,
});
const body = { taskTitle: 'Build 1 API', notes: 'PRIVATE_CV_TEXT', targetRole: 'Engineer', targetIndustry: 'Technology' };
const entries = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
beforeEach(() => { output.length = 0; vi.spyOn(console, 'log').mockImplementation((line: unknown) => { output.push(String(line)); }); });
afterEach(() => vi.restoreAllMocks());

describe('safe request telemetry', () => {
  it('emits one structured record with a generated correlation ID and elapsed time', async () => {
    const response = await request(app()).get('/health').set('X-Request-ID', 'UNTRUSTED_ID');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/u);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ event: 'http_request', severity: 'INFO', requestId: response.headers['x-request-id'], route: '/health', method: 'GET', status: 200, errorCategory: 'none' });
    expect(entries()[0]?.durationMs).toEqual(expect.any(Number));
    expect(Number(entries()[0]?.durationMs)).toBeGreaterThanOrEqual(0);
  });
  it('does not log request/response bodies, query strings, credentials or identity', async () => {
    await request(app()).post('/api/cv-bullet?key=PRIVATE_QUERY').set('Authorization', 'Bearer PRIVATE_AUTH')
      .set('X-Firebase-AppCheck', 'PRIVATE_APP_CHECK').set('X-Request-ID', 'PRIVATE_ID').set('Cookie', 'PRIVATE_COOKIE').send(body);
    expect(entries()).toHaveLength(1);
    expect(output.join('')).not.toContain('PRIVATE_');
    expect(entries()[0]?.route).toBe('/api/cv-bullet');
  });
  it('replaces unmatched paths with a fixed label', async () => {
    const response = await request(app()).get('/PRIVATE_PATH?token=PRIVATE_QUERY');
    expect(response.status).toBe(404);
    expect(entries()[0]).toMatchObject({ route: 'unmatched', status: 404, errorCategory: 'not_found' });
    expect(output.join('')).not.toContain('PRIVATE_');
  });
  it('captures parser failures without leaking PDF bytes or malformed JSON', async () => {
    await request(app()).post('/api/cv-profile').set('Content-Type', 'application/json').send('{"pdfBase64":"PRIVATE_PDF",');
    expect(entries()[0]).toMatchObject({ status: 400, errorCategory: 'invalid_json' });
    expect(output.join('')).not.toContain('PRIVATE_');
  });
  it('preserves unsupported-body status without default Express error logging', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request(app()).post('/api/cv-profile').set('Content-Type', 'application/json; charset=private-charset').send('{"pdfBase64":"PRIVATE_PDF"}');
    expect(response.status).toBe(415);
    expect(entries()[0]).toMatchObject({ status: 415, errorCategory: 'http_error' });
    expect(output.join('')).not.toContain('PRIVATE_');
    expect(stderr).not.toHaveBeenCalled();
  });
  it.each([
    { dependency: { consumeQuota: async () => ({ allowed: false, retryAfterSeconds: 10 }) }, status: 429, category: 'application_quota' },
    { dependency: { generateCvBullet: async () => { throw new ProviderRateLimitError('PRIVATE_PROVIDER_KEY'); } }, status: 429, category: 'provider_quota' },
    { dependency: { consumeQuota: async () => { throw new QuotaStoreError('PRIVATE_STORE_DETAIL'); } }, status: 503, category: 'quota_store_unavailable' },
    { dependency: { generateCvBullet: async () => { throw new Error('PRIVATE_ERROR_DETAIL'); } }, status: 500, category: 'internal_error' },
  ])('categorizes $category without logging raw errors', async ({ dependency, status, category }) => {
    const response = await request(app(dependency)).post('/api/cv-bullet').send(body);
    expect(response.status).toBe(status);
    expect(entries()[0]).toMatchObject({ status, errorCategory: category, severity: status >= 500 ? 'ERROR' : 'WARNING' });
    expect(output.join('')).not.toContain('PRIVATE_');
  });
  it('does not break a response if the logging sink fails', async () => {
    vi.mocked(console.log).mockImplementation(() => { throw new Error('sink down'); });
    expect((await request(app()).get('/health')).status).toBe(200);
  });
});
