import express, { type Express } from 'express';

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

  return app;
};
