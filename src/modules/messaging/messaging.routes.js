import { Router } from 'express';
import { MessagingController } from './messaging.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  consultationParamSchema,
  attachmentParamSchema,
  sendMessageSchema,
  uploadAttachmentSchema,
  listMessagesQuerySchema,
} from './messaging.validation.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

// Message routes
router.post(
  '/:id/messages',
  validateRequest({
    params: consultationParamSchema,
    body: sendMessageSchema,
  }),
  MessagingController.sendMessage
);

router.get(
  '/:id/messages',
  validateRequest({
    params: consultationParamSchema,
    query: listMessagesQuerySchema,
  }),
  MessagingController.getMessages
);

// Attachment routes
router.post(
  '/:id/attachments',
  validateRequest({
    params: consultationParamSchema,
    body: uploadAttachmentSchema,
  }),
  MessagingController.uploadAttachment
);

router.get(
  '/:id/attachments',
  validateRequest({
    params: consultationParamSchema,
  }),
  MessagingController.listAttachments
);

router.get(
  '/:id/attachments/:attachmentId',
  validateRequest({
    params: attachmentParamSchema,
  }),
  MessagingController.downloadAttachment
);

export default router;
