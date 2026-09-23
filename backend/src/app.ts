import express, { type ErrorRequestHandler, type Express } from 'express';

import { createAiRouter, type AiRouterDependencies } from './routes/ai.js';

export type AppDependencies = AiRouterDependencies;

export const createApp = (dependencies: AppDependencies = {}): Express => {
  const app = express();

  app.disable('x-powered-by');
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

  return app;
};

const requestBodyErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 413) {
    response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large.' } });
    return;
  }
  if (isMalformedJsonError(error)) {
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

const isMalformedJsonError = (error: unknown): boolean =>
  error instanceof SyntaxError &&
  'status' in error &&
  error.status === 400 &&
  'type' in error &&
  error.type === 'entity.parse.failed';
