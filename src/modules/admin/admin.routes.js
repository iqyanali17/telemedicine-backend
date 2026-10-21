import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  auditLogsQuerySchema,
  listDoctorVerificationsQuerySchema,
  verifyDoctorParamSchema,
  verifyDoctorBodySchema,
} from './admin.validation.js';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.get('/analytics', AdminController.getAnalytics);
router.get('/audit-logs', validateRequest({ query: auditLogsQuerySchema }), AdminController.getAuditLogs);
router.get('/doctors', validateRequest({ query: listDoctorVerificationsQuerySchema }), AdminController.listDoctors);
router.patch(
  '/doctors/:id/verify',
  validateRequest({ params: verifyDoctorParamSchema, body: verifyDoctorBodySchema }),
  AdminController.verifyDoctor
);

export default router;
