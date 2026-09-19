import { Router, type Request, type Response } from 'express';

interface RoadmapRequestBody {
  experience: string;
  targetRole: {
    title: string;
    employer?: string;
  };
}

interface CvBulletRequestBody {
  taskTitle: string;
  notes: string;
}

interface NotImplementedBody {
  error: {
    code: 'NOT_IMPLEMENTED';
    message: string;
  };
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

export const createAiRouter = (): Router => {
  const router = Router();

  router.post('/roadmap', notImplemented<RoadmapRequestBody>);
  router.post('/cv-bullet', notImplemented<CvBulletRequestBody>);

  return router;
};
