import express, { type ErrorRequestHandler, type Express } from 'express';

import { createAiRouter, type AiRouterDependencies } from './routes/ai.js';
import { markRequestError, requestLog } from './observability/requestLog.js';

export type AppDependencies = AiRouterDependencies;

export const createApp = (dependencies: AppDependencies = {}): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLog);
  app.use('/api/cv-profile', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'trajectory-backend',
    });
  });
  app.use('/api', createAiRouter(dependencies));
  app.use(requestBodyErrorHandler);
  app.use(safeErrorHandler);

  return app;
};

const requestBodyErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 413) {
    markRequestError(response, 'request_too_large');
    response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large.' } });
    return;
  }
  if (isMalformedJsonError(error)) {
    markRequestError(response, 'invalid_json');
    response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON.',
      },
    });
    return;
  }

  next(error);
};

// Do not delegate to Express's default handler, which can print raw errors.
const safeErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const status = typeof error === 'object' && error !== null && 'status' in error &&
    (error.status === 400 || error.status === 415) ? error.status : 500;
  markRequestError(response, status === 500 ? 'internal_error' : 'http_error');
  if (response.headersSent) { response.destroy(); return; }
  response.status(status).json({ error: status === 500
    ? { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }
    : { code: 'INVALID_REQUEST_BODY', message: 'Request body is unsupported or invalid.' } });
};

const isMalformedJsonError = (error: unknown): boolean =>
  error instanceof SyntaxError &&
  'status' in error &&
  error.status === 400 &&
  'type' in error &&
  error.type === 'entity.parse.failed';
