import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name cannot be empty')
    .max(50, 'First name cannot exceed 50 characters')
    .regex(/^[A-Za-z\s'-]+$/, 'First name must contain only letters and cannot contain numbers')
    .optional(),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name cannot be empty')
    .max(50, 'Last name cannot exceed 50 characters')
    .regex(/^[A-Za-z\s'-]+$/, 'Last name must contain only letters and cannot contain numbers')
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+\d{1,3}[- ]?)?\d{10}$/, 'Invalid phone number format. Mobile number must be a valid 10-digit phone number')
    .optional(),
  dateOfBirth: z.string().datetime({ message: 'dateOfBirth must be a valid ISO 8601 datetime' }).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'], {
    errorMap: () => ({ message: 'Gender must be one of: MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY' }),
  }).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
    errorMap: () => ({ message: 'Invalid blood group. Allowed values: A+, A-, B+, B-, AB+, AB-, O+, O-' }),
  }).optional(),
  address: z.string().max(255, 'Address cannot exceed 255 characters').trim().optional(),
  emergencyContact: z
    .string()
    .trim()
    .regex(/^(\+\d{1,3}[- ]?)?\d{10}$/, 'Invalid emergency contact phone number format. Mobile number must be a valid 10-digit phone number')
    .optional(),
});
