import { Router } from 'express';
import { ConsultationController } from './consultation.controller.js';
import videoSessionRoutes from '../video-sessions/video-session.routes.js';
import messagingRoutes from '../messaging/messaging.routes.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  bookConsultationSchema,
  updateConsultationStatusSchema,
  consultationIdParamSchema,
  listConsultationsQuerySchema,
} from './consultation.validation.js';

const router = Router();

router.use(authenticate);

// Mount video session subroutes (/api/v1/consultations/:id/video/*)
router.use('/', videoSessionRoutes);

// Mount clinical messaging & attachment subroutes (/api/v1/consultations/:id/messages and /attachments)
router.use('/', messagingRoutes);

router.post(
  '/book',
  authorize('PATIENT'),
  validateRequest({ body: bookConsultationSchema }),
  ConsultationController.book
);

router.get(
  '/',
  validateRequest({ query: listConsultationsQuerySchema }),
  ConsultationController.list
);

router.get(
  '/:id',
  validateRequest({ params: consultationIdParamSchema }),
  ConsultationController.getById
);

router.patch(
  '/:id/status',
  validateRequest({
    params: consultationIdParamSchema,
    body: updateConsultationStatusSchema,
  }),
  ConsultationController.updateStatus
);

export default router;
