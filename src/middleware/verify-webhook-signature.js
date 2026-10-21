import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Validates HMAC-SHA256 signature on incoming payment gateway webhooks.
 * Checks 'x-webhook-signature' and standard 'x-razorpay-signature' headers against PAYMENT_WEBHOOK_SECRET.
 */
export const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-webhook-signature'] || req.headers['x-razorpay-signature'];

  if (!signature) {
    return next(ApiError.unauthorized('Webhook signature missing in request headers'));
  }

  const rawPayload = req.rawBody || (req.body ? JSON.stringify(req.body) : '');
  const expectedSignature = crypto
    .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
    .update(rawPayload)
    .digest('hex');

  try {
    const signatureBuffer = Buffer.from(String(signature), 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return next(ApiError.unauthorized('Invalid webhook signature verification failed'));
    }

    return next();
  } catch {
    return next(ApiError.unauthorized('Malformed webhook signature format'));
  }
};
