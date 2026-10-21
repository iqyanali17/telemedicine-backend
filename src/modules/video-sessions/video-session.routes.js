import { Router } from 'express';
import { VideoSessionController } from './video-session.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { consultationParamSchema, endSessionSchema } from './video-session.validation.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post(
  '/:id/video/join',
  validateRequest({ params: consultationParamSchema }),
  VideoSessionController.join
);

router.post(
  '/:id/video/leave',
  validateRequest({ params: consultationParamSchema }),
  VideoSessionController.leave
);

router.post(
  '/:id/video/end',
  validateRequest({ params: consultationParamSchema, body: endSessionSchema }),
  VideoSessionController.end
);

router.get(
  '/:id/video',
  validateRequest({ params: consultationParamSchema }),
  VideoSessionController.get
);

export default router;
