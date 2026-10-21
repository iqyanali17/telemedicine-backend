import { z } from 'zod';

export const consultationParamSchema = z.object({
  id: z.string().uuid('Consultation ID must be a valid UUID'),
});

export const attachmentParamSchema = z.object({
  id: z.string().uuid('Consultation ID must be a valid UUID'),
  attachmentId: z.string().uuid('Attachment ID must be a valid UUID'),
});

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content cannot be empty')
    .max(2000, 'Message content cannot exceed 2000 characters')
    .trim(),
  attachmentId: z.string().uuid('Attachment ID must be a valid UUID').optional(),
});

export const uploadAttachmentSchema = z.object({
  fileName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name cannot exceed 255 characters'),
  mimeType: z.enum(
    ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    { errorMap: () => ({ message: 'Allowed file types are PDF, JPEG, PNG, and WebP' }) }
  ),
  fileData: z.string().min(1, 'Base64 file data is required'),
});

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  order: z.enum(['asc', 'desc']).default('asc'),
});
