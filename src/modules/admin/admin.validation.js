import { z } from 'zod';

export const auditLogsQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listDoctorVerificationsQuerySchema = z.object({
  isVerified: z
    .enum(['true', 'false', 'all'])
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const verifyDoctorParamSchema = z.object({
  id: z.string().uuid('Doctor ID must be a valid UUID'),
});

export const verifyDoctorBodySchema = z.object({
  isVerified: z.boolean({ required_error: 'isVerified boolean (true or false) is required' }),
  rejectionReason: z.string().trim().max(500, 'Rejection reason cannot exceed 500 characters').optional(),
});
