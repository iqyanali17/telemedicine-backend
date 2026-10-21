import crypto from 'crypto';
import { BasePaymentGateway } from './base-payment-gateway.js';

export class MockPaymentGateway extends BasePaymentGateway {
  constructor(config = {}) {
    super(config);
    this.name = 'MOCK_GATEWAY';
    this.idempotentRefunds = new Map();
  }

  /**
   * Generates a deterministic mock order
   */
  async createOrder({ amount, currency = 'INR', receipt = '' }) {
    const orderId = `order_mock_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    return {
      orderId,
      amount,
      currency,
      receipt,
      status: 'created',
      provider: this.name,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies HMAC-SHA256 webhook signatures
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    if (!signature || !secret) return false;
    try {
      const payloadString =
        typeof rawPayload === 'string'
          ? rawPayload
          : Buffer.isBuffer(rawPayload)
            ? rawPayload.toString('utf8')
            : JSON.stringify(rawPayload);

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Simulates processing an upstream gateway refund with idempotency
   */
  async processRefund({ transactionRef, amount, reason = 'Consultation cancelled', idempotencyKey = null }) {
    if (!transactionRef) {
      throw new Error('Transaction reference is required for payment refund');
    }

    if (idempotencyKey && this.idempotentRefunds.has(idempotencyKey)) {
      return this.idempotentRefunds.get(idempotencyKey);
    }

    const refundRef = `rfnd_mock_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const refundResult = {
      success: true,
      refundRef,
      transactionRef,
      amount,
      currency: 'INR',
      status: 'processed',
      reason,
      provider: this.name,
      idempotencyKey,
      processedAt: new Date().toISOString(),
    };

    if (idempotencyKey) {
      this.idempotentRefunds.set(idempotencyKey, refundResult);
    }

    return refundResult;
  }
}
