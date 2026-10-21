import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { auditLogsQuerySchema } from './admin.validation.js';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.get('/analytics', AdminController.getAnalytics);
router.get('/audit-logs', validateRequest({ query: auditLogsQuerySchema }), AdminController.getAuditLogs);

export default router;
