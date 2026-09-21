import { Router, type Request, type Response } from 'express';

import { authenticateAuthorization, AuthenticationError, type RequestAuthenticator } from '../security/auth.js';
import { consumeAiQuota, QuotaStoreError, type AiRateLimiter } from '../security/rateLimit.js';
import {
  CvBulletGenerationError, CvBulletValidationError, generateCvBullet,
  normalizeCvBulletInput, type CvBulletInput, type CvBulletResult,
} from '../services/cvBullet.js';
import {
  generateRoadmap, normalizeRoadmapInput, RoadmapGenerationError, RoadmapValidationError,
  type RoadmapInput, type RoadmapResult,
} from '../services/roadmap.js';

type CvBulletGenerator = (input: CvBulletInput) => Promise<CvBulletResult>;
type RoadmapGenerator = (input: RoadmapInput) => Promise<RoadmapResult>;

export interface AiRouterDependencies {
  generateCvBullet?: CvBulletGenerator;
  generateRoadmap?: RoadmapGenerator;
  authenticate?: RequestAuthenticator;
  consumeQuota?: AiRateLimiter;
}

interface ApiErrorBody { error: { code: string; message: string } }

const sendError = (response: Response, status: number, code: string, message: string): void => {
  response.status(status).json({ error: { code, message } });
};

const handleError = (error: unknown, response: Response): void => {
  if (error instanceof AuthenticationError) {
    sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  } else if (error instanceof RoadmapValidationError) {
    sendError(response, 400, 'INVALID_ROADMAP_INPUT', error.message);
  } else if (error instanceof CvBulletValidationError) {
    sendError(response, 400, 'INVALID_CV_BULLET_INPUT', error.message);
  } else if (error instanceof QuotaStoreError) {
    sendError(response, 503, 'SERVICE_UNAVAILABLE', 'AI quota is temporarily unavailable.');
  } else if (error instanceof RoadmapGenerationError) {
    sendError(response, 502, 'ROADMAP_GENERATION_FAILED', 'Unable to generate a valid roadmap.');
  } else if (error instanceof CvBulletGenerationError) {
    sendError(response, 502, 'CV_BULLET_GENERATION_FAILED', 'Unable to generate a valid CV bullet.');
  } else {
    sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
};

export const createAiRouter = ({
  generateCvBullet: generateBullet = generateCvBullet,
  generateRoadmap: generateTasks = generateRoadmap,
  authenticate = authenticateAuthorization,
  consumeQuota = consumeAiQuota,
}: AiRouterDependencies = {}): Router => {
  const router = Router();

  const handlePost = <TInput, TResult>(
    normalize: (value: unknown) => TInput,
    generate: (input: TInput) => Promise<TResult>,
  ) => async (
    request: Request<Record<string, never>, TResult | ApiErrorBody, unknown>,
    response: Response<TResult | ApiErrorBody>,
  ): Promise<void> => {
    try {
      const user = await authenticate(request.headers.authorization);
      const input = normalize(request.body);
      const decision = await consumeQuota(user.uid);
      if (!decision.allowed) {
        response.set('Retry-After', String(decision.retryAfterSeconds ?? 1));
        sendError(response, 429, 'RATE_LIMIT_EXCEEDED', 'AI request limit exceeded.');
        return;
      }
      response.status(200).json(await generate(input));
    } catch (error: unknown) {
      handleError(error, response);
    }
  };

  router.post('/roadmap', handlePost(normalizeRoadmapInput, generateTasks));
  router.post('/cv-bullet', handlePost(normalizeCvBulletInput, generateBullet));
  return router;
};
