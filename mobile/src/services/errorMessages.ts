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
  consent_required: {
    title: 'AI sharing is off',
    message: 'Review and enable AI processing on the experience screen or in the CV tab to continue.',
    canRetry: false,
  },
  rate_limited: {
    title: 'Too many requests',
    message: 'AI capacity is temporarily limited. Please wait and try again later.',
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
    message: "We couldn't verify this device. Check your connection and retry. If this continues, contact support.",
    canRetry: true,
  },
};

/** Screens use only this — never ApiError.message or .kind directly. */
export const getErrorMessage = (error: unknown): ErrorMessage =>
  error instanceof ApiError ? MESSAGES[error.kind] : GENERIC;
