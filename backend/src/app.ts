import express, { type Express } from 'express';

import { createAiRouter } from './routes/ai.js';

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'trajectory-backend',
    });
  });
  app.use('/api', createAiRouter());

  return app;
};
