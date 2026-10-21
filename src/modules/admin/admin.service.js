import { prisma } from '../../config/database.js';

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
}
