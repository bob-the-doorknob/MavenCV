import express, { type ErrorRequestHandler, type Express } from 'express';

import { createAiRouter, type AiRouterDependencies } from './routes/ai.js';

export type AppDependencies = AiRouterDependencies;

export const createApp = (dependencies: AppDependencies = {}): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'trajectory-backend',
    });
  });
  app.use('/api', createAiRouter(dependencies));
  app.use(malformedJsonHandler);

  return app;
};

const malformedJsonHandler: ErrorRequestHandler = (error, _request, response, next) => {
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
