import { describe, expect, it, vi } from 'vitest';

import { authenticateAuthorization, AuthenticationError } from './auth.js';

const verified = { uid: 'user-1', email_verified: true, firebase: { sign_in_provider: 'password' } };

describe('Firebase authentication', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b'])('rejects malformed bearer header %#', async (header) => {
    const verifier = { verifyIdToken: vi.fn() };
    await expect(authenticateAuthorization(header, verifier)).rejects.toBeInstanceOf(AuthenticationError);
    expect(verifier.verifyIdToken).not.toHaveBeenCalled();
  });

  it('checks revocation and returns only the user ID', async () => {
    const verifier = { verifyIdToken: vi.fn().mockResolvedValue(verified) };
    await expect(authenticateAuthorization('bearer valid-token', verifier)).resolves.toEqual({ uid: 'user-1' });
    expect(verifier.verifyIdToken).toHaveBeenCalledWith('valid-token', true);
  });

  it.each([
    { ...verified, email_verified: false },
    { ...verified, firebase: { sign_in_provider: 'anonymous' } },
    { ...verified, uid: '' },
  ])('rejects disallowed account %#', async (account) => {
    await expect(authenticateAuthorization('Bearer token', { verifyIdToken: async () => account })).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('hides verification errors', async () => {
    await expect(authenticateAuthorization('Bearer token', { verifyIdToken: async () => { throw new Error('provider detail'); } })).rejects.toThrow('Authentication is required');
  });
});
