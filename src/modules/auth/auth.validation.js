import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .refine((val) => val.includes('@'), {
      message: "Email address must contain '@'",
    })
    .pipe(z.string().email("Valid email address containing '@' is required")),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special symbol (e.g. !@#$%^&*)'),
  role: z.enum(['PATIENT'], {
    errorMap: () => ({ message: 'Only PATIENT role is permitted for public registration' }),
  }).default('PATIENT'),
  firstName: z
    .string({ required_error: 'First name is required' })
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .regex(/^[A-Za-z\s'-]+$/, 'First name must contain only letters and cannot contain numbers'),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .regex(/^[A-Za-z\s'-]+$/, 'Last name must contain only letters and cannot contain numbers'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+\d{1,3}[- ]?)?\d{10}$/, 'Mobile number must be a valid 10-digit phone number')
    .optional()
    .or(z.literal('')),
});

export const registerDoctorSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .refine((val) => val.includes('@'), {
      message: "Email address must contain '@'",
    })
    .pipe(z.string().email("Valid email address containing '@' is required")),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special symbol (e.g. !@#$%^&*)'),
  firstName: z
    .string({ required_error: 'First name is required' })
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .regex(/^[A-Za-z\s'-]+$/, 'First name must contain only letters and cannot contain numbers'),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .regex(/^[A-Za-z\s'-]+$/, 'Last name must contain only letters and cannot contain numbers'),
  phone: z
    .string({ errorMap: () => ({ message: 'Mobile phone number is required for doctor registration' }) })
    .trim()
    .regex(/^(\+\d{1,3}[- ]?)?\d{10}$/, 'Mobile number must be a valid 10-digit phone number'),
  licenseNumber: z
    .string({ errorMap: () => ({ message: 'Medical license number is required' }) })
    .trim()
    .min(3, 'License number must be at least 3 characters long')
    .max(50, 'License number cannot exceed 50 characters'),
  specialization: z
    .string({ errorMap: () => ({ message: 'Specialization is required' }) })
    .trim()
    .min(2, 'Specialization must be at least 2 characters long')
    .max(100, 'Specialization cannot exceed 100 characters'),
  experienceYears: z
    .coerce.number({ errorMap: () => ({ message: 'Years of clinical experience is required' }) })
    .int('Years of experience must be an integer')
    .min(0, 'Experience years cannot be negative')
    .max(70, 'Experience years cannot exceed 70'),
  consultationFee: z
    .coerce.number({ errorMap: () => ({ message: 'Consultation fee is required' }) })
    .positive('Consultation fee must be greater than zero')
    .max(100000, 'Consultation fee cannot exceed ₹100,000'),
  qualification: z
    .string({ errorMap: () => ({ message: 'Medical qualification / degree is required' }) })
    .trim()
    .min(2, 'Qualification must be at least 2 characters long')
    .max(150, 'Qualification cannot exceed 150 characters'),
  bio: z
    .string()
    .trim()
    .max(1000, 'Biography cannot exceed 1000 characters')
    .optional(),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .refine((val) => val.includes('@'), {
      message: "Email address must contain '@'",
    })
    .pipe(z.string().email("Valid email address containing '@' is required")),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token must be a non-empty string').optional(),
});

export const mfaVerifySchema = z.object({
  secret: z.string().min(16, 'TOTP secret is required'),
  code: z
    .string()
    .length(6, 'TOTP code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only numbers'),
});

export const mfaLoginSchema = z.object({
  mfaSessionToken: z.string().min(1, 'MFA session token is required'),
  code: z
    .string()
    .length(6, 'TOTP code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only numbers'),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1, 'Current password is required'),
  code: z
    .string()
    .length(6, 'TOTP code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only numbers'),
});

