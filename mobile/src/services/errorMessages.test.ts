import { describe, expect, it, vi } from 'vitest';
vi.mock('./auth', () => ({ getAuthToken: async () => 'test-token' }));
vi.mock('./appCheck', () => ({ getAppCheckToken: async () => 'test-app-check-token' }));
vi.mock('./privacy', () => ({ loadConsent: async () => undefined, hasAiConsent: () => true }));

import { ApiError, type ApiErrorKind } from './api';
import { getErrorMessage } from './errorMessages';

describe('getErrorMessage', () => {
  it.each<ApiErrorKind>(['rate_limited', 'network', 'server', 'invalid_response', 'auth'])(
    'returns a non-empty title, message, and a boolean canRetry for %s',
    (kind) => {
      const result = getErrorMessage(new ApiError(kind, 'internal detail'));

      expect(result.title).toBeTruthy();
      expect(result.message).toBeTruthy();
      expect(typeof result.canRetry).toBe('boolean');
    },
  );

  it('does not promise that a daily quota resets in a minute', () => {
    expect(getErrorMessage(new ApiError('rate_limited', 'x')).message).toBe(
      'AI capacity is temporarily limited. Please wait and try again later.',
    );
  });

  it('permits retry after a transient auth failure', () => {
    const result = getErrorMessage(new ApiError('auth', 'x'));
    expect(result.message).toContain('Check your connection');
    expect(result.canRetry).toBe(true);
  });

  it('gives server and invalid_response the same generic message', () => {
    expect(getErrorMessage(new ApiError('server', 'x'))).toEqual(getErrorMessage(new ApiError('invalid_response', 'x')));
  });

  it('falls back to the generic message for a non-ApiError', () => {
    expect(getErrorMessage(new Error('boom'))).toEqual(getErrorMessage(new ApiError('server', 'x')));
    expect(getErrorMessage('a string')).toEqual(getErrorMessage(new ApiError('server', 'x')));
    expect(getErrorMessage(undefined)).toEqual(getErrorMessage(new ApiError('server', 'x')));
  });
});
