import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  consultationId: z.string().uuid('Valid consultation UUID is required'),
  paymentMethod: z.enum(['UPI', 'NET_BANKING', 'CARD', 'WALLET']).default('UPI'),
});

export const paymentParamSchema = z.object({
  consultationId: z.string().uuid('Consultation ID must be a valid UUID'),
});

export const paymentWebhookSchema = z.object({
  event: z.enum(['payment.captured', 'payment.failed', 'payment.refunded']),
  consultationId: z.string().uuid('Valid consultation UUID is required'),
  transactionRef: z.string().min(6),
  amount: z.coerce.number().positive(),
  status: z.enum(['COMPLETED', 'FAILED', 'REFUNDED']),
});

export const refundPaymentSchema = z.object({
  reason: z.string().min(1, 'Reason cannot be empty').max(500, 'Reason cannot exceed 500 characters').optional(),
});

export const reconciliationQuerySchema = z.object({
  startDate: z.string().datetime({ message: 'startDate must be a valid ISO 8601 string' }).optional(),
  endDate: z.string().datetime({ message: 'endDate must be a valid ISO 8601 string' }).optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

