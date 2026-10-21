import { z } from 'zod';

export const createPrescriptionSchema = z.object({
  consultationId: z.string().uuid('Valid consultation UUID is required'),
  diagnosis: z.string().min(3, 'Diagnosis must be at least 3 characters').max(1000),
  medicines: z.array(
    z.object({
      name: z.string().min(1, 'Medicine name is required'),
      dosage: z.string().min(1, 'Dosage is required (e.g. 500mg, 1 tablet)'),
      frequency: z.string().min(1, 'Frequency is required (e.g. twice daily after meals)'),
      duration: z.string().min(1, 'Duration is required (e.g. 7 days)'),
      instructions: z.string().optional(),
    })
  ).min(1, 'At least one medicine must be prescribed'),
  instructions: z.string().max(2000).optional(),
  validUntil: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.validUntil) {
      return new Date(data.validUntil) > new Date();
    }
    return true;
  },
  {
    message: 'validUntil date must be in the future',
    path: ['validUntil'],
  }
);

export const prescriptionParamSchema = z.object({
  id: z.string().uuid('Prescription ID must be a valid UUID'),
});

export const prescriptionConsultationParamSchema = z.object({
  consultationId: z.string().uuid('Consultation ID must be a valid UUID'),
});
