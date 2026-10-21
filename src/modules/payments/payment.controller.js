import { PaymentService } from './payment.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class PaymentController {
  static initiate = asyncHandler(async (req, res) => {
    const payment = await PaymentService.initiatePayment(req.user.id, req.body);
    return ApiResponse.created(res, 'Payment initiated successfully', payment);
  });

  static getStatus = asyncHandler(async (req, res) => {
    const payment = await PaymentService.getPaymentStatus(req.user, req.params.consultationId);
    return ApiResponse.ok(res, 'Payment status retrieved successfully', payment);
  });

  static handleWebhook = asyncHandler(async (req, res) => {
    const payment = await PaymentService.processWebhook(req.body);
    return ApiResponse.ok(res, 'Payment webhook processed successfully', payment);
  });

  static refund = asyncHandler(async (req, res) => {
    const payment = await PaymentService.processRefund(
      req.user,
      req.params.consultationId,
      req.body
    );
    return ApiResponse.ok(res, 'Payment refunded successfully', payment);
  });

  static getReconciliation = asyncHandler(async (req, res) => {
    const report = await PaymentService.getReconciliationReport(req.query);
    return ApiResponse.ok(res, 'Payment reconciliation report retrieved successfully', report);
  });
}

