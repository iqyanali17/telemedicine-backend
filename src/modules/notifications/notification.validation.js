import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().default(false)
  ),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Notification ID must be a valid UUID'),
});

export const dispatchRemindersSchema = z.object({
  windowMinutes: z.coerce.number().int().min(5).max(1440).default(60),
});
