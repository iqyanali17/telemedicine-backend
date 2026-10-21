import { Router } from 'express';
import { NotificationController } from './notification.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  dispatchRemindersSchema,
} from './notification.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validateRequest({ query: listNotificationsQuerySchema }),
  NotificationController.list
);

router.patch(
  '/mark-all-read',
  NotificationController.markAllRead
);

router.patch(
  '/:id/read',
  validateRequest({ params: notificationIdParamSchema }),
  NotificationController.markRead
);

router.post(
  '/dispatch-reminders',
  authorize('ADMIN'),
  validateRequest({ body: dispatchRemindersSchema }),
  NotificationController.dispatchReminders
);

export default router;
