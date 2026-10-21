import { MockPaymentGateway } from './mock-payment-gateway.js';
import { RazorpayGateway } from './razorpay-gateway.js';
import { env } from '../../../config/env.js';

let paymentGatewayInstance = null;

export const getPaymentGateway = () => {
  if (!paymentGatewayInstance) {
    if (env.PAYMENT_PROVIDER === 'RAZORPAY') {
      paymentGatewayInstance = new RazorpayGateway({
        webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
      });
    } else {
      // Default to MockPaymentGateway for deterministic local & test execution
      paymentGatewayInstance = new MockPaymentGateway({
        webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
      });
    }
  }
  return paymentGatewayInstance;
};

export { BasePaymentGateway } from './base-payment-gateway.js';
export { MockPaymentGateway } from './mock-payment-gateway.js';
export { RazorpayGateway } from './razorpay-gateway.js';

