import { NotificationService } from './notification.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class NotificationController {
  static list = asyncHandler(async (req, res) => {
    const result = await NotificationService.getUserNotifications(req.user.id, req.query);
    return res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: result.notifications,
      unreadCount: result.unreadCount,
      pagination: result.pagination,
    });
  });

  static markRead = asyncHandler(async (req, res) => {
    const notification = await NotificationService.markAsRead(req.user.id, req.params.id);
    return ApiResponse.ok(res, 'Notification marked as read', notification);
  });

  static markAllRead = asyncHandler(async (req, res) => {
    const result = await NotificationService.markAllAsRead(req.user.id);
    return ApiResponse.ok(res, 'All notifications marked as read', result);
  });

  static dispatchReminders = asyncHandler(async (req, res) => {
    const result = await NotificationService.dispatchUpcomingReminders(req.body);
    return ApiResponse.ok(res, 'Upcoming reminders processed successfully', result);
  });
}
