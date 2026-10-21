import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { NotificationDispatcher } from '../notifications/notification.dispatcher.js';

export class ConsultationService {
  /**
   * Concurrency-safe, idempotent consultation booking
   */
  static async bookConsultation(patientId, { slotId, notes, idempotencyKey }) {
    // 1. Idempotency check: If key already used, return existing consultation safely
    if (idempotencyKey) {
      const existing = await prisma.consultation.findUnique({
        where: { idempotencyKey },
        include: {
          slot: true,
          doctor: {
            include: {
              user: {
                select: {
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });

      if (existing) {
        if (existing.patientId !== patientId) {
          throw ApiError.conflict('Idempotency key collision from another patient');
        }
        return existing;
      }
    }

    // 2. Concurrency-safe atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find slot and verify availability
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: slotId },
      });

      if (!slot) {
        throw ApiError.notFound('Availability slot not found');
      }

      if (slot.status !== 'AVAILABLE') {
        throw ApiError.conflict('Slot is no longer available or already booked');
      }

      const consultationNumber = `AMR-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      // Atomic update to BOOKED status
      const updateResult = await tx.availabilitySlot.updateMany({
        where: { id: slotId, status: 'AVAILABLE' },
        data: { status: 'BOOKED' },
      });

      if (updateResult.count === 0) {
        throw ApiError.conflict('Slot is no longer available or already booked');
      }

      // Create consultation
      const consultation = await tx.consultation.create({
        data: {
          consultationNumber,
          patientId,
          doctorId: slot.doctorId,
          slotId: slot.id,
          scheduledAt: slot.startTime,
          notes,
          idempotencyKey,
          status: 'SCHEDULED',
        },
        include: {
          slot: true,
          patient: {
            select: { id: true, email: true },
          },
          doctor: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });

      // Create audit trail entry
      await tx.auditLog.create({
        data: {
          userId: patientId,
          action: 'BOOK_CONSULTATION',
          entityType: 'Consultation',
          entityId: consultation.id,
          metadata: {
            consultationNumber,
            slotId,
            doctorId: slot.doctorId,
          },
        },
      });

      return consultation;
    });

    // Asynchronously dispatch booking confirmation notifications
    NotificationDispatcher.notifyBookingConfirmed(result);

    return result;
  }

  /**
   * Retrieves single consultation by ID with object-level authorization
   */
  static async getConsultationById(user, id) {
    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        slot: true,
        patient: {
          select: {
            id: true,
            email: true,
            profile: true,
          },
        },
        doctor: {
          select: {
            id: true,
            specialization: true,
            consultationFee: true,
            qualification: true,
            user: {
              select: {
                profile: true,
              },
            },
          },
        },
        prescription: true,
        payment: true,
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    // Object-level authorization
    if (user.role === 'PATIENT' && consultation.patientId !== user.id) {
      throw ApiError.forbidden('Unauthorized access to this consultation');
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Unauthorized access to this consultation');
      }
    }

    return consultation;
  }

  /**
   * Updates consultation status following the clinical lifecycle
   */
  static async updateConsultationStatus(user, id, { status, cancellationReason, notes }) {
    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        doctor: { include: { user: true } },
        patient: true,
        slot: true,
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    // Cannot modify terminal states
    if (consultation.status === 'COMPLETED' || consultation.status === 'CANCELLED') {
      throw ApiError.conflict(`Cannot modify consultation that is already ${consultation.status}`);
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Only the assigned doctor can update clinical status');
      }
    }

    // Enforce role authorization per transition
    if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
      if (user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
        throw ApiError.forbidden('Only a doctor or administrator can advance consultation progress');
      }
      if (status === 'IN_PROGRESS' && consultation.status !== 'SCHEDULED') {
        throw ApiError.conflict('Only scheduled consultations can transition to in-progress');
      }
      if (status === 'COMPLETED' && consultation.status !== 'IN_PROGRESS') {
        throw ApiError.conflict('Consultation must be in-progress before marking as completed');
      }
    }

    if (status === 'CANCELLED') {
      if (user.role === 'PATIENT') {
        if (consultation.patientId !== user.id) {
          throw ApiError.forbidden('You are not authorized to cancel this consultation');
        }
        if (consultation.status !== 'SCHEDULED') {
          throw ApiError.conflict('Patients can only cancel consultations that are in SCHEDULED status');
        }
      }
    }

    if (status === 'NO_SHOW') {
      if (user.role === 'PATIENT') {
        throw ApiError.forbidden('Patients cannot mark a consultation as no-show');
      }
      if (consultation.status !== 'SCHEDULED' && consultation.status !== 'IN_PROGRESS') {
        throw ApiError.conflict('Only scheduled or in-progress consultations can be marked as no-show');
      }
    }

    const now = new Date();
    const updateData = {
      status,
      ...(notes && { notes }),
      ...(status === 'IN_PROGRESS' && { startedAt: now }),
      ...(status === 'COMPLETED' && { endedAt: now }),
      ...(status === 'CANCELLED' && { cancellationReason }),
    };

    const result = await prisma.$transaction(async (tx) => {
      const updatedConsultation = await tx.consultation.update({
        where: { id },
        data: updateData,
        include: { slot: true },
      });

      // If cancelled, free up the availability slot
      if (status === 'CANCELLED' && consultation.slotId) {
        await tx.availabilitySlot.update({
          where: { id: consultation.slotId },
          data: { status: 'AVAILABLE' },
        });
      }

      // Record audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: `UPDATE_CONSULTATION_${status}`,
          entityType: 'Consultation',
          entityId: id,
          metadata: {
            previousStatus: consultation.status,
            newStatus: status,
            cancellationReason: cancellationReason || null,
          },
        },
      });

      return updatedConsultation;
    });

    if (status === 'CANCELLED') {
      NotificationDispatcher.notifyCancellation(consultation, cancellationReason);
    }

    return result;
  }

  static async getConsultations(user, { status, page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const where = {
      ...(status && { status }),
    };

    if (user.role === 'PATIENT') {
      where.patientId = user.id;
    } else if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile) return { consultations: [], pagination: { page, limit, total: 0, totalPages: 0 } };
      where.doctorId = doctorProfile.id;
    }
    // ADMIN can view all consultations

    const [consultations, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        skip,
        take: limit,
        include: {
          slot: true,
          patient: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
          doctor: {
            select: {
              id: true,
              specialization: true,
              user: {
                select: {
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
          prescription: true,
          payment: true,
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      prisma.consultation.count({ where }),
    ]);

    return {
      consultations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
