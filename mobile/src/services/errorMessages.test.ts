import { describe, expect, it } from 'vitest';

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

  it('gives rate_limited a "try again in a minute" message', () => {
    expect(getErrorMessage(new ApiError('rate_limited', 'x')).message).toBe(
      'Too many requests. Try again in a minute.',
    );
  });

  it('gives auth a device-restart message and no retry', () => {
    const result = getErrorMessage(new ApiError('auth', 'x'));
    expect(result.message).toBe("We couldn't verify this device. Please restart the app.");
    expect(result.canRetry).toBe(false);
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
