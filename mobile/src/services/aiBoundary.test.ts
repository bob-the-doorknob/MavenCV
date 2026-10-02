import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ consent: vi.fn(), attest: vi.fn(), auth: vi.fn(), fetch: vi.fn() }));
vi.mock('./privacy', () => ({ loadConsent: async () => undefined, hasAiConsent: mocks.consent }));
vi.mock('./appCheck', () => ({ getAppCheckToken: mocks.attest }));
vi.mock('./auth', () => ({ getAuthToken: mocks.auth }));
import { extractProfile, generateCvBullet, generateRoadmap } from './api';
const operations = [
  () => generateRoadmap({ roleId: 'software-engineer', level: 'internship', experience: 'Built 1 app.' }),
  () => generateCvBullet({ taskTitle: 'Build 1 app', notes: 'Built it.' }),
  () => extractProfile({ pdfBase64: 'JVBERi0xLjQ=' }, 'software-engineer'),
];
beforeEach(() => {
  vi.clearAllMocks(); mocks.consent.mockReturnValue(true); mocks.attest.mockResolvedValue('attested'); mocks.auth.mockResolvedValue('user-token');
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ tasks: [{ id: 't1', title: 'Build 1 API' }], bullets: ['Built 1 app.'], experience: 'Built 1 app.', questions: [] }) });
  vi.stubGlobal('fetch', mocks.fetch); vi.stubEnv('EXPO_PUBLIC_USE_MOCK_API', 'false'); vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.example.test');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('AI transmission boundary', () => {
  it.each(operations)('blocks content, auth and attestation until consent', async (run) => {
    mocks.consent.mockReturnValue(false);
    await expect(run()).rejects.toMatchObject({ kind: 'consent_required' });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.attest).not.toHaveBeenCalled();
  });
  it.each(operations)('blocks content if attestation fails', async (run) => {
    mocks.attest.mockRejectedValueOnce(new Error('invalid device'));
    await expect(run()).rejects.toMatchObject({ kind: 'auth' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('checks withdrawal again after asynchronous token acquisition', async () => {
    mocks.auth.mockImplementationOnce(async () => { mocks.consent.mockReturnValue(false); return 'user-token'; });
    await expect(operations[0]!()).rejects.toMatchObject({ kind: 'consent_required' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('sends both independent credentials', async () => {
    await operations[0]!();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer user-token', 'X-Firebase-AppCheck': 'attested' }) }));
  });
});
