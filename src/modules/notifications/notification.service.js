import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { NotificationDispatcher } from './notification.dispatcher.js';

export class NotificationService {
  /**
   * Retrieves paginated notifications for the authenticated user
   */
  static async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
    const where = {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Marks a specific notification as read
   */
  static async markAsRead(userId, notificationId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw ApiError.notFound('Notification not found');
    }

    if (notification.userId !== userId) {
      throw ApiError.forbidden('Unauthorized access to notification');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Marks all user notifications as read
   */
  static async markAllAsRead(userId) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { markedCount: result.count };
  }

  /**
   * Scans upcoming consultations and dispatches reminders without duplicate delivery
   */
  static async dispatchUpcomingReminders({ windowMinutes = 60 } = {}) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

    // Find consultations scheduled within upcoming window
    const upcomingConsultations = await prisma.consultation.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: now,
          lte: windowEnd,
        },
      },
      include: {
        patient: { select: { id: true, email: true } },
        doctor: {
          select: {
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { lastName: true } },
              },
            },
          },
        },
      },
    });

    const dispatchedIds = [];

    for (const consultation of upcomingConsultations) {
      // Check if reminder was already dispatched for this consultation
      const existingReminder = await prisma.notification.findFirst({
        where: {
          userId: consultation.patientId,
          type: 'UPCOMING_REMINDER',
          metadata: {
            path: ['consultationId'],
            equals: consultation.id,
          },
        },
      });

      if (!existingReminder) {
        await NotificationDispatcher.notifyUpcomingReminder(consultation);
        dispatchedIds.push(consultation.id);
      }
    }

    return {
      scannedCount: upcomingConsultations.length,
      dispatchedCount: dispatchedIds.length,
      consultationIds: dispatchedIds,
    };
  }
}
