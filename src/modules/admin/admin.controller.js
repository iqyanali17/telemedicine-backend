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

  static listDoctors = asyncHandler(async (req, res) => {
    const result = await AdminService.listDoctors(req.query);
    return ApiResponse.paginated(
      res,
      'Doctor verifications retrieved successfully',
      { summary: result.summary, items: result.items },
      result.pagination
    );
  });

  static verifyDoctor = asyncHandler(async (req, res) => {
    const result = await AdminService.verifyDoctor(req.params.id, req.body, req.user.id);
    const message = result.isVerified
      ? 'Doctor medical license verified successfully. Profile is now active in patient directory.'
      : 'Doctor verification revoked successfully';
    return ApiResponse.ok(res, message, result);
  });
}
