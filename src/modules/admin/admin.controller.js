import { AdminService } from './admin.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class AdminController {
  static getAnalytics = asyncHandler(async (req, res) => {
    const analytics = await AdminService.getAnalyticsOverview();
    return ApiResponse.ok(res, 'Admin analytics overview retrieved successfully', analytics);
  });

  static getAuditLogs = asyncHandler(async (req, res) => {
    const result = await AdminService.getAuditLogs(req.query);
    return ApiResponse.ok(res, 'Audit logs retrieved successfully', result.logs, result.pagination);
  });
}
