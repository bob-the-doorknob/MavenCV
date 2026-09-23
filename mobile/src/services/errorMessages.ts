import { ApiError, type ApiErrorKind } from './api';

export interface ErrorMessage {
  title: string;
  message: string;
  canRetry: boolean;
}

const GENERIC: ErrorMessage = {
  title: 'Something went wrong',
  message: 'Something went wrong on our side. Please try again.',
  canRetry: true,
};

const MESSAGES: Readonly<Record<ApiErrorKind, ErrorMessage>> = {
  rate_limited: {
    title: 'Too many requests',
    message: 'Too many requests. Try again in a minute.',
    canRetry: true,
  },
  network: {
    title: 'Connection problem',
    message: "You're offline or the connection is slow. Check your internet and retry.",
    canRetry: true,
  },
  server: GENERIC,
  invalid_response: GENERIC,
  auth: {
    title: "Couldn't verify this device",
    message: "We couldn't verify this device. Please restart the app.",
    canRetry: false,
  },
};

/** Screens use only this — never ApiError.message or .kind directly. */
export const getErrorMessage = (error: unknown): ErrorMessage =>
  error instanceof ApiError ? MESSAGES[error.kind] : GENERIC;
