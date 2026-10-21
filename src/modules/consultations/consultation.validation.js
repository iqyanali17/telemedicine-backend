import { z } from 'zod';

export const bookConsultationSchema = z.object({
  slotId: z.string().uuid('Valid slot UUID is required'),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const updateConsultationStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  cancellationReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
}).refine(
  (data) => {
    if (data.status === 'CANCELLED' && !data.cancellationReason) {
      return false;
    }
    return true;
  },
  {
    message: 'cancellationReason is required when cancelling a consultation',
    path: ['cancellationReason'],
  }
);

export const consultationIdParamSchema = z.object({
  id: z.string().uuid('Consultation ID must be a valid UUID'),
});

export const listConsultationsQuerySchema = z.object({
  status: z.enum(['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
