import { Router, type Request, type Response } from 'express';

import {
  CvBulletGenerationError,
  CvBulletValidationError,
  generateCvBullet,
  normalizeCvBulletInput,
  type CvBulletInput,
  type CvBulletResult,
} from '../services/cvBullet.js';

interface RoadmapRequestBody {
  experience: string;
  targetRole: {
    title: string;
    employer?: string;
  };
}

interface NotImplementedBody {
  error: {
    code: 'NOT_IMPLEMENTED';
    message: string;
  };
}

interface ApiErrorBody {
  error: {
    code:
      | 'INVALID_CV_BULLET_INPUT'
      | 'CV_BULLET_GENERATION_FAILED'
      | 'INTERNAL_ERROR';
    message: string;
  };
}

type CvBulletGenerator = (input: CvBulletInput) => Promise<CvBulletResult>;

export interface AiRouterDependencies {
  generateCvBullet?: CvBulletGenerator;
}

const notImplemented = <TRequestBody>(
  _request: Request<Record<string, never>, NotImplementedBody, TRequestBody>,
  response: Response<NotImplementedBody>,
): void => {
  response.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'This AI endpoint is reserved for a later implementation phase.',
    },
  });
};

export const createAiRouter = ({
  generateCvBullet: generate = generateCvBullet,
}: AiRouterDependencies = {}): Router => {
  const router = Router();

  router.post('/roadmap', notImplemented<RoadmapRequestBody>);
  router.post(
    '/cv-bullet',
    async (
      request: Request<Record<string, never>, CvBulletResult | ApiErrorBody, unknown>,
      response: Response<CvBulletResult | ApiErrorBody>,
    ): Promise<void> => {
      try {
        const input = normalizeCvBulletInput(request.body);
        const result = await generate(input);
        response.status(200).json(result);
      } catch (error: unknown) {
        if (error instanceof CvBulletValidationError) {
          response.status(400).json({
            error: {
              code: 'INVALID_CV_BULLET_INPUT',
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof CvBulletGenerationError) {
          response.status(502).json({
            error: {
              code: 'CV_BULLET_GENERATION_FAILED',
              message: 'Unable to generate a valid CV bullet.',
            },
          });
          return;
        }

        response.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
          },
        });
      }
    },
  );

  return router;
};
