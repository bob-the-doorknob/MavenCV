import { Router, type Request, type Response } from 'express';
import { ProviderRateLimitError } from '../services/gemini.js';
import { markRequestError, type ErrorCategory } from '../observability/requestLog.js';
import { AppCheckError, verifyAppCheck, type AppCheckVerifier } from '../security/appCheck.js';

import { publicTargetRoleCategories } from '../data/targets.js';
import { authenticateAuthorization, AuthenticationError, type RequestAuthenticator } from '../security/auth.js';
import { consumeAiQuota, QuotaStoreError, type AiRateLimiter } from '../security/rateLimit.js';
import {
  CvBulletGenerationError, CvBulletValidationError, generateCvBullet,
  normalizeCvBulletInput, type CvBulletInput, type CvBulletResult,
} from '../services/cvBullet.js';
import {
  CvProfileGenerationError, CvProfileValidationError, generateCvProfile,
  normalizeCvProfileInput, type CvProfileInput, type CvProfileResult,
} from '../services/cvProfile.js';
import {
  generateRoadmap, normalizeRoadmapInput, RoadmapGenerationError, RoadmapValidationError,
  type RoadmapInput, type RoadmapResult,
} from '../services/roadmap.js';

type CvBulletGenerator = (input: CvBulletInput) => Promise<CvBulletResult>;
type CvProfileGenerator = (input: CvProfileInput) => Promise<CvProfileResult>;
type RoadmapGenerator = (input: RoadmapInput) => Promise<RoadmapResult>;

export interface AiRouterDependencies {
  generateCvBullet?: CvBulletGenerator;
  generateCvProfile?: CvProfileGenerator;
  generateRoadmap?: RoadmapGenerator;
  authenticate?: RequestAuthenticator;
  attest?: AppCheckVerifier;
  consumeQuota?: AiRateLimiter;
}

interface ApiErrorBody { error: { code: string; message: string } }

const errorCategories: Readonly<Record<string, ErrorCategory>> = {
  RATE_LIMIT_EXCEEDED: 'application_quota', APP_CHECK_REQUIRED: 'app_check', AUTHENTICATION_REQUIRED: 'authentication',
  INVALID_ROADMAP_INPUT: 'validation', INVALID_CV_BULLET_INPUT: 'validation', INVALID_CV_PROFILE_INPUT: 'validation',
  SERVICE_UNAVAILABLE: 'quota_store_unavailable', ROADMAP_GENERATION_FAILED: 'generation_failed',
  CV_BULLET_GENERATION_FAILED: 'generation_failed', CV_PROFILE_GENERATION_FAILED: 'generation_failed',
  INTERNAL_ERROR: 'internal_error',
};
const sendError = (response: Response, status: number, code: string, message: string, category?: ErrorCategory): void => {
  markRequestError(response, category ?? errorCategories[code] ?? 'internal_error');
  response.status(status).json({ error: { code, message } });
};

const handleError = (error: unknown, response: Response): void => {
  if (error instanceof ProviderRateLimitError) {
    response.set('Retry-After', '60');
    sendError(response, 429, 'RATE_LIMIT_EXCEEDED', 'AI capacity is temporarily exhausted. Please try again later.', 'provider_quota');
  } else if (error instanceof AppCheckError) {
    sendError(response, 403, 'APP_CHECK_REQUIRED', 'App verification is required.');
  } else if (error instanceof AuthenticationError) {
    sendError(response, 401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  } else if (error instanceof RoadmapValidationError) {
    sendError(response, 400, 'INVALID_ROADMAP_INPUT', error.message);
  } else if (error instanceof CvBulletValidationError) {
    sendError(response, 400, 'INVALID_CV_BULLET_INPUT', error.message);
  } else if (error instanceof CvProfileValidationError) {
    sendError(response, 400, 'INVALID_CV_PROFILE_INPUT', error.message);
  } else if (error instanceof QuotaStoreError) {
    sendError(response, 503, 'SERVICE_UNAVAILABLE', 'AI quota is temporarily unavailable.');
  } else if (error instanceof RoadmapGenerationError) {
    sendError(response, 502, 'ROADMAP_GENERATION_FAILED', 'Unable to generate a valid roadmap.');
  } else if (error instanceof CvBulletGenerationError) {
    sendError(response, 502, 'CV_BULLET_GENERATION_FAILED', 'Unable to generate a valid CV bullet.');
  } else if (error instanceof CvProfileGenerationError) {
    sendError(response, 502, 'CV_PROFILE_GENERATION_FAILED', 'Unable to extract CV experience.');
  } else {
    sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
};

export const createAiRouter = ({
  generateCvBullet: generateBullet = generateCvBullet,
  generateCvProfile: generateProfile = generateCvProfile,
  generateRoadmap: generateTasks = generateRoadmap,
  authenticate = authenticateAuthorization,
  attest = verifyAppCheck,
  consumeQuota = consumeAiQuota,
}: AiRouterDependencies = {}): Router => {
  const router = Router();

  router.get('/roles', (_request, response) => {
    response.status(200).json({ categories: publicTargetRoleCategories });
  });

  const handlePost = <TInput, TResult>(
    normalize: (value: unknown) => TInput,
    generate: (input: TInput) => Promise<TResult>,
  ) => async (
    request: Request<Record<string, never>, TResult | ApiErrorBody, unknown>,
    response: Response<TResult | ApiErrorBody>,
  ): Promise<void> => {
    try {
      await attest(request.headers['x-firebase-appcheck']);
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
  router.post('/cv-profile', handlePost(normalizeCvProfileInput, generateProfile));
  return router;
};
