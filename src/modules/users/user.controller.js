import { UserService } from './user.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class UserController {
  static getProfile = asyncHandler(async (req, res) => {
    const user = await UserService.getUserProfile(req.user.id);
    const fullName = `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim();

    const summary = {
      name: fullName || user.email,
      role: user.role,
      email: user.email,
      isMfaActive: user.isMfaActive,
      hasCompletedProfile: Boolean(user.profile?.firstName && user.profile?.lastName),
    };

    const profile = {
      id: user.id,
      email: user.email,
      role: user.role,
      isMfaActive: user.isMfaActive,
      firstName: user.profile?.firstName || null,
      lastName: user.profile?.lastName || null,
      phone: user.profile?.phone || null,
      gender: user.profile?.gender || null,
      bloodGroup: user.profile?.bloodGroup || null,
      address: user.profile?.address || null,
      emergencyContact: user.profile?.emergencyContact || null,
      dateOfBirth: user.profile?.dateOfBirth || null,
      profile: user.profile,
    };

    return ApiResponse.ok(res, 'User profile retrieved successfully', {
      summary,
      profile,
      ...user,
    });
  });

  static updateProfile = asyncHandler(async (req, res) => {
    const updated = await UserService.updateProfile(req.user.id, req.body);
    return ApiResponse.ok(res, 'Profile updated successfully', updated);
  });
}
