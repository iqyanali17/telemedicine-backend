import { z } from 'zod';

export const consultationParamSchema = z.object({
  id: z.string().uuid('Consultation ID must be a valid UUID'),
});

export const endSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});
