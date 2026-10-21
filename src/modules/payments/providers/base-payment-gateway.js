/**
 * Base payment gateway provider interface
 */
export class BasePaymentGateway {
  /**
   * Initialize gateway with provider configuration
   * @param {object} config
   */
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Create an order / intent with the payment provider
   * @param {object} orderDetails
   * @returns {Promise<object>}
   */
  async createOrder() {
    throw new Error('createOrder() must be implemented by payment gateway provider');
  }

  /**
   * Verify signature of incoming provider webhook payload
   * @param {string|Buffer} rawBody
   * @param {string} signature
   * @param {string} secret
   * @returns {boolean}
   */
  verifyWebhookSignature() {
    throw new Error('verifyWebhookSignature() must be implemented by payment gateway provider');
  }

  /**
   * Execute an automated refund with the payment provider
   * @param {object} refundDetails
   * @returns {Promise<object>}
   */
  async processRefund() {
    throw new Error('processRefund() must be implemented by payment gateway provider');
  }
}
