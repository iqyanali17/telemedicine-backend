import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';

export class AdminService {
  static async getAnalyticsOverview() {
    const [
      totalUsers,
      totalDoctors,
      totalConsultations,
      scheduledConsultations,
      inProgressConsultations,
      completedConsultations,
      cancelledConsultations,
      totalPrescriptions,
      completedRevenue,
      pendingRevenue,
      topDoctors,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.doctorProfile.count({ where: { isVerified: true } }),
      prisma.consultation.count(),
      prisma.consultation.count({ where: { status: 'SCHEDULED' } }),
      prisma.consultation.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.consultation.count({ where: { status: 'COMPLETED' } }),
      prisma.consultation.count({ where: { status: 'CANCELLED' } }),
      prisma.prescription.count(),
      prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
      prisma.doctorProfile.findMany({
        take: 5,
        orderBy: { consultations: { _count: 'desc' } },
        select: {
          id: true,
          specialization: true,
          consultationFee: true,
          user: {
            select: {
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          _count: {
            select: { consultations: true },
          },
        },
      }),
    ]);

    return {
      metrics: {
        users: {
          total: totalUsers,
          verifiedDoctors: totalDoctors,
        },
        consultations: {
          total: totalConsultations,
          scheduled: scheduledConsultations,
          inProgress: inProgressConsultations,
          completed: completedConsultations,
          cancelled: cancelledConsultations,
        },
        clinical: {
          prescriptionsIssued: totalPrescriptions,
        },
        financial: {
          completedRevenue: completedRevenue._sum.amount || 0,
          pendingRevenue: pendingRevenue._sum.amount || 0,
        },
        topDoctors: topDoctors.map((doc) => ({
          doctorId: doc.id,
          name: `Dr. ${doc.user.profile?.firstName || ''} ${doc.user.profile?.lastName || ''}`.trim(),
          specialization: doc.specialization,
          consultationFee: doc.consultationFee,
          consultationCount: doc._count.consultations,
        })),
      },
    };
  }

  static async getAuditLogs({ action, entityType, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {
      ...(action && { action }),
      ...(entityType && { entityType }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lists all doctors with verification status filters for administrative review
   */
  static async listDoctors({ isVerified, search, page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    const where = {
      ...(isVerified !== undefined && { isVerified }),
      ...(search && {
        OR: [
          { licenseNumber: { contains: search, mode: 'insensitive' } },
          { specialization: { contains: search, mode: 'insensitive' } },
          { qualification: { contains: search, mode: 'insensitive' } },
          {
            user: {
              profile: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          },
          {
            user: {
              email: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };

    const [doctors, total, verifiedCount, pendingCount] = await Promise.all([
      prisma.doctorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              createdAt: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                  gender: true,
                },
              },
            },
          },
        },
      }),
      prisma.doctorProfile.count({ where }),
      prisma.doctorProfile.count({ where: { isVerified: true } }),
      prisma.doctorProfile.count({ where: { isVerified: false } }),
    ]);

    const items = doctors.map((doc) => {
      const firstName = doc.user?.profile?.firstName || '';
      const lastName = doc.user?.profile?.lastName || '';
      return {
        id: doc.id,
        userId: doc.userId,
        name: `Dr. ${firstName} ${lastName}`.trim(),
        email: doc.user?.email || '',
        phone: doc.user?.profile?.phone || null,
        licenseNumber: doc.licenseNumber,
        specialization: doc.specialization,
        experienceYears: doc.experienceYears,
        consultationFee: doc.consultationFee,
        qualification: doc.qualification,
        bio: doc.bio,
        isVerified: doc.isVerified,
        createdAt: doc.createdAt,
      };
    });

    return {
      summary: {
        total,
        verified: verifiedCount,
        pending: pendingCount,
      },
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Verifies or revokes a doctor's credentials and records audit log
   */
  static async verifyDoctor(doctorId, { isVerified, rejectionReason }, adminId) {
    const existing = await prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!existing) {
      throw ApiError.notFound('Doctor profile not found');
    }

    const updated = await prisma.doctorProfile.update({
      where: { id: doctorId },
      data: { isVerified },
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
    });

    // Record audit trail
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: isVerified ? 'DOCTOR_VERIFIED' : 'DOCTOR_VERIFICATION_REVOKED',
        entityType: 'DoctorProfile',
        entityId: doctorId,
        metadata: {
          doctorEmail: existing.user?.email,
          licenseNumber: existing.licenseNumber,
          rejectionReason: rejectionReason || null,
        },
      },
    });

    const firstName = updated.user?.profile?.firstName || '';
    const lastName = updated.user?.profile?.lastName || '';

    return {
      id: updated.id,
      userId: updated.userId,
      name: `Dr. ${firstName} ${lastName}`.trim(),
      email: updated.user?.email || '',
      licenseNumber: updated.licenseNumber,
      specialization: updated.specialization,
      isVerified: updated.isVerified,
      rejectionReason: rejectionReason || null,
      updatedAt: updated.updatedAt,
    };
  }
}
