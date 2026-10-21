import crypto from 'crypto';
import { BasePaymentGateway } from './base-payment-gateway.js';

export class RazorpayGateway extends BasePaymentGateway {
  constructor(config = {}) {
    super(config);
    this.name = 'RAZORPAY';
    this.keyId = config.keyId || process.env.RAZORPAY_KEY_ID;
    this.keySecret = config.keySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!this.keyId || !this.keySecret) {
      throw new Error(
        'RazorpayGateway configuration error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment'
      );
    }
  }

  /**
   * Verifies HMAC-SHA256 signature from Razorpay webhook
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    const webhookSecret = secret || process.env.PAYMENT_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) return false;

    try {
      const payloadString =
        typeof rawPayload === 'string'
          ? rawPayload
          : Buffer.isBuffer(rawPayload)
            ? rawPayload.toString('utf8')
            : JSON.stringify(rawPayload);

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payloadString)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Upstream refund implementation for Razorpay API
   */
  async processRefund({ transactionRef, _amount, _reason = 'Consultation cancelled', _idempotencyKey = null }) {
    if (!transactionRef) {
      throw new Error('Transaction reference is required for Razorpay refund');
    }

    // In a live production environment with verified credentials, this calls the Razorpay API:
    // const response = await fetch(`https://api.razorpay.com/v1/payments/${transactionRef}/refund`, { ... });
    throw new Error(
      'Razorpay live API refund requires valid production API keys and live banking credentials'
    );
  }
}
