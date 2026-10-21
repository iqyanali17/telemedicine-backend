import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';

export class DoctorService {
  static async listDoctors({
    search,
    q,
    specialization,
    minExperience,
    minFee,
    maxFee,
    sortBy = 'experience_desc',
    page = 1,
    limit = 10,
  }) {
    const skip = (page - 1) * limit;
    const searchTerm = search || q;

    const where = {
      isVerified: true,
      ...(specialization && {
        specialization: { contains: specialization, mode: 'insensitive' },
      }),
      ...(minExperience !== undefined && { experienceYears: { gte: minExperience } }),
      ...((minFee !== undefined || maxFee !== undefined) && {
        consultationFee: {
          ...(minFee !== undefined && { gte: minFee }),
          ...(maxFee !== undefined && { lte: maxFee }),
        },
      }),
      ...(searchTerm && {
        OR: [
          { specialization: { contains: searchTerm, mode: 'insensitive' } },
          { qualification: { contains: searchTerm, mode: 'insensitive' } },
          { bio: { contains: searchTerm, mode: 'insensitive' } },
          {
            user: {
              profile: {
                OR: [
                  { firstName: { contains: searchTerm, mode: 'insensitive' } },
                  { lastName: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      }),
    };

    let orderBy = { experienceYears: 'desc' };
    if (sortBy === 'fee_asc') orderBy = { consultationFee: 'asc' };
    if (sortBy === 'fee_desc') orderBy = { consultationFee: 'desc' };
    if (sortBy === 'experience_desc') orderBy = { experienceYears: 'desc' };
    if (sortBy === 'name_asc') {
      orderBy = {
        user: {
          profile: {
            firstName: 'asc',
          },
        },
      };
    }

    const [doctors, total] = await Promise.all([
      prisma.doctorProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: {
                select: { firstName: true, lastName: true, phone: true },
              },
            },
          },
        },
        orderBy,
      }),
      prisma.doctorProfile.count({ where }),
    ]);

    return {
      doctors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getDoctorById(id) {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { firstName: true, lastName: true, phone: true, gender: true },
            },
          },
        },
        availabilitySlots: {
          where: {
            status: 'AVAILABLE',
            startTime: { gte: new Date() },
          },
          take: 10,
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!doctor) {
      throw ApiError.notFound('Doctor profile not found');
    }

    return doctor;
  }

  static async updateDoctorProfile(userId, updateData) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctorProfile) {
      throw ApiError.notFound('Doctor profile not found');
    }

    const updated = await prisma.doctorProfile.update({
      where: { userId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
    });

    return updated;
  }
}
