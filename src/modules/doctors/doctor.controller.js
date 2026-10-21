import { DoctorService } from './doctor.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class DoctorController {
  static list = asyncHandler(async (req, res) => {
    const result = await DoctorService.listDoctors(req.query);
    const verifiedCount = result.doctors.filter((d) => d.isVerified).length;
    const unverifiedCount = result.doctors.length - verifiedCount;

    const summary = {
      total: result.pagination.total,
      verified: verifiedCount,
      unverified: unverifiedCount,
    };

    const items = result.doctors.map((d) => {
      const firstName = d.user?.profile?.firstName || '';
      const lastName = d.user?.profile?.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim();

      return {
        id: d.id,
        userId: d.userId,
        name: fullName || 'Doctor',
        email: d.user?.email || '',
        specialization: d.specialization,
        experienceYears: d.experienceYears,
        consultationFee: d.consultationFee,
        isVerified: d.isVerified,
        qualification: d.qualification,
        bio: d.bio,
        user: d.user,
      };
    });

    return ApiResponse.paginated(
      res,
      'Doctors retrieved successfully',
      { summary, items },
      result.pagination
    );
  });

  static getById = asyncHandler(async (req, res) => {
    const doctor = await DoctorService.getDoctorById(req.params.id);
    const firstName = doctor.user?.profile?.firstName || '';
    const lastName = doctor.user?.profile?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();

    const summary = {
      name: fullName || 'Doctor',
      specialization: doctor.specialization,
      experienceYears: doctor.experienceYears,
      consultationFee: doctor.consultationFee,
      isVerified: doctor.isVerified,
      availableSlotsCount: doctor.availabilitySlots?.length || 0,
    };

    const profile = {
      id: doctor.id,
      userId: doctor.userId,
      name: fullName || 'Doctor',
      email: doctor.user?.email || '',
      phone: doctor.user?.profile?.phone || null,
      gender: doctor.user?.profile?.gender || null,
      specialization: doctor.specialization,
      experienceYears: doctor.experienceYears,
      consultationFee: doctor.consultationFee,
      qualification: doctor.qualification,
      bio: doctor.bio,
      isVerified: doctor.isVerified,
      availableSlots: doctor.availabilitySlots || [],
      user: doctor.user,
    };

    return ApiResponse.ok(res, 'Doctor profile retrieved successfully', {
      summary,
      profile,
      ...doctor,
    });
  });

  static updateProfile = asyncHandler(async (req, res) => {
    const updated = await DoctorService.updateDoctorProfile(req.user.id, req.body);
    return ApiResponse.ok(res, 'Doctor profile updated successfully', updated);
  });
}
