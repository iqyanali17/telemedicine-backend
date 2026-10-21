import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';

export class UserService {
  static async getUserProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isMfaEnabled: true,
        createdAt: true,
        profile: true,
        doctorProfile: true,
      },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    return user;
  }

  static async updateProfile(userId, data) {
    if (data.phone) {
      const cleanPhone = data.phone.trim();
      const existingPhone = await prisma.profile.findFirst({
        where: {
          phone: cleanPhone,
          NOT: { userId },
        },
      });
      if (existingPhone) {
        throw ApiError.conflict('An account with this phone number already exists');
      }
    }

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        ...data,
        ...(data.phone && { phone: data.phone.trim() }),
        ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
      },
      create: {
        userId,
        firstName: data.firstName || 'User',
        lastName: data.lastName || '',
        ...data,
        ...(data.phone && { phone: data.phone.trim() }),
        ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
      },
    });

    return profile;
  }
}
