import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { verifyWebhookSignature } from '../../middleware/verify-webhook-signature.js';
import {
  initiatePaymentSchema,
  paymentParamSchema,
  paymentWebhookSchema,
  refundPaymentSchema,
  reconciliationQuerySchema,
} from './payment.validation.js';

const router = Router();

// Public webhook receiver for payment provider callbacks (HMAC signature protected)
router.post(
  '/webhook',
  verifyWebhookSignature,
  validateRequest({ body: paymentWebhookSchema }),
  PaymentController.handleWebhook
);

// Protected routes
router.use(authenticate);

// Admin-only payment reconciliation and audit reporting (must be mounted before /:consultationId)
router.get(
  '/reconciliation',
  authorize('ADMIN'),
  validateRequest({ query: reconciliationQuerySchema }),
  PaymentController.getReconciliation
);

router.post(
  '/initiate',
  validateRequest({ body: initiatePaymentSchema }),
  PaymentController.initiate
);

router.post(
  '/:consultationId/refund',
  validateRequest({
    params: paymentParamSchema,
    body: refundPaymentSchema,
  }),
  PaymentController.refund
);

router.get(
  '/:consultationId',
  validateRequest({ params: paymentParamSchema }),
  PaymentController.getStatus
);

export default router;
