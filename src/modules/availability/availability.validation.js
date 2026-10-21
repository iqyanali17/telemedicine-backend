import { z } from 'zod';

export const createSlotsSchema = z.object({
  slots: z
    .array(
      z
        .object({
          startTime: z.string().datetime(),
          endTime: z.string().datetime(),
        })
        .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
          message: 'endTime must be strictly after startTime',
        })
        .refine((data) => new Date(data.startTime) >= new Date(Date.now() - 5 * 60 * 1000), {
          message: 'startTime cannot be in the past',
        })
    )
    .min(1, 'At least one slot must be provided')
    .max(100, 'Cannot create more than 100 slots per request'),
});

export const querySlotsSchema = z.object({
  doctorId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD').optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'BLOCKED', 'CANCELLED']).optional(),
});

export const slotParamSchema = z.object({
  id: z.string().uuid('Slot ID must be a valid UUID'),
});
