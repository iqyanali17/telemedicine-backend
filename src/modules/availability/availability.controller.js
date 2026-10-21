import { AvailabilityService } from './availability.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class AvailabilityController {
  static getSlots = asyncHandler(async (req, res) => {
    const slots = await AvailabilityService.getSlots(req.query);
    return ApiResponse.ok(res, 'Availability slots retrieved successfully', slots);
  });

  static createSlots = asyncHandler(async (req, res) => {
    const result = await AvailabilityService.createSlots(req.user.id, req.body.slots);
    return ApiResponse.created(res, 'Availability slots created successfully', result);
  });

  static deleteSlot = asyncHandler(async (req, res) => {
    await AvailabilityService.deleteSlot(req.user.id, req.params.id);
    return ApiResponse.ok(res, 'Availability slot deleted successfully');
  });
}
