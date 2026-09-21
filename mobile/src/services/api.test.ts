import { describe, expect, it, vi } from 'vitest';

vi.mock('./anonymousAuth', () => ({ getAnonymousIdToken: async () => 'test-id-token' }));

import { postJson } from './api';

describe('backend API client', () => {
  it('sends the Firebase ID token on AI requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(postJson('/api/roadmap', { experience: 'Built APIs' })).resolves.toEqual({ tasks: [] });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/roadmap'), expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-id-token' },
    }));
  });
});
