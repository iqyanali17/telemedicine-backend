import { VideoSessionService } from './video-session.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class VideoSessionController {
  static join = asyncHandler(async (req, res) => {
    const result = await VideoSessionService.joinSession(req.user, req.params.id);
    return ApiResponse.ok(res, 'Video consultation room session joined successfully', result);
  });

  static leave = asyncHandler(async (req, res) => {
    const result = await VideoSessionService.leaveSession(req.user, req.params.id);
    return ApiResponse.ok(res, result.message, result);
  });

  static end = asyncHandler(async (req, res) => {
    const session = await VideoSessionService.endSession(req.user, req.params.id, req.body || {});
    return ApiResponse.ok(res, 'Video consultation room terminated successfully', session);
  });

  static get = asyncHandler(async (req, res) => {
    const session = await VideoSessionService.getSession(req.user, req.params.id);
    return ApiResponse.ok(res, 'Video session details retrieved successfully', session);
  });
}
