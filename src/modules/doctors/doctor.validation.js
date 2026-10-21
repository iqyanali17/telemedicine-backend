import { z } from 'zod';

export const listDoctorsQuerySchema = z.object({
  search: z.string().trim().optional(),
  q: z.string().trim().optional(),
  specialization: z.string().trim().optional(),
  minExperience: z.coerce.number().int().min(0).optional(),
  minFee: z.coerce.number().min(0).optional(),
  maxFee: z.coerce.number().positive().optional(),
  sortBy: z.enum(['experience_desc', 'fee_asc', 'fee_desc', 'name_asc']).default('experience_desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const updateDoctorProfileSchema = z.object({
  specialization: z.string().min(1).optional(),
  experienceYears: z.number().int().min(0).optional(),
  consultationFee: z.number().positive().optional(),
  qualification: z.string().min(1).optional(),
  bio: z.string().optional(),
});

export const doctorParamSchema = z.object({
  id: z.string().uuid('Doctor ID must be a valid UUID'),
});
