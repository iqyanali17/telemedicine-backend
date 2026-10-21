import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';
import { getVideoProvider } from './video-provider.interface.js';

export class VideoSessionService {
  /**
   * Helper to verify participant authorization on a consultation
   */
  static async verifyParticipantAuthorization(user, consultation) {
    if (user.role === 'PATIENT' && consultation.patientId !== user.id) {
      throw ApiError.forbidden('You are not authorized to access this consultation video session');
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Only the assigned doctor can access this video consultation');
      }
    }
  }

  /**
   * Joins or initializes a secure video consultation room
   */
  static async joinSession(user, consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        slot: true,
        patient: { select: { id: true, email: true, profile: true } },
        doctor: {
          include: {
            user: { select: { id: true, email: true, profile: true } },
          },
        },
        videoSession: true,
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    // 1. Participant object-level authorization check
    await this.verifyParticipantAuthorization(user, consultation);

    // 2. Clinical consultation status checks
    if (consultation.status === 'CANCELLED') {
      throw ApiError.conflict('Cannot access video room for a cancelled consultation');
    }
    if (consultation.status === 'NO_SHOW') {
      throw ApiError.conflict('Cannot access video room for a no-show consultation');
    }
    if (consultation.status === 'COMPLETED') {
      throw ApiError.conflict('Cannot access video room because consultation is already completed');
    }

    // 3. Time window check (grace periods before and after schedule)
    const now = new Date();
    const scheduledStart = new Date(consultation.scheduledAt);
    const startWindow = new Date(
      scheduledStart.getTime() - env.VIDEO_SESSION_GRACE_MINUTES_BEFORE * 60 * 1000
    );
    const slotEnd = consultation.slot?.endTime
      ? new Date(consultation.slot.endTime)
      : new Date(scheduledStart.getTime() + 30 * 60 * 1000);
    const endWindow = new Date(
      slotEnd.getTime() + env.VIDEO_SESSION_GRACE_MINUTES_AFTER * 60 * 1000
    );

    if (now < startWindow) {
      throw ApiError.conflict(
        `Video room access is not open yet. Room opens ${env.VIDEO_SESSION_GRACE_MINUTES_BEFORE} minutes before scheduled time.`
      );
    }

    if (now > endWindow) {
      throw ApiError.conflict('Consultation video session window has expired.');
    }

    const provider = getVideoProvider();

    // 4. Atomic room creation or retrieval
    let session = consultation.videoSession;

    if (!session) {
      const roomData = await provider.generateRoom(consultation);

      session = await prisma.videoSession.create({
        data: {
          consultationId: consultation.id,
          roomId: roomData.roomId,
          roomUrl: roomData.roomUrl,
          provider: roomData.provider,
          status: 'INITIATED',
        },
      });
    }

    // 5. Clinical lifecycle advancement: If doctor joins, mark session ACTIVE & consultation IN_PROGRESS
    if (user.role === 'DOCTOR' || user.role === 'ADMIN') {
      const updateData = {};
      if (session.status === 'INITIATED') {
        updateData.status = 'ACTIVE';
        updateData.startedAt = now;
      }

      if (Object.keys(updateData).length > 0) {
        session = await prisma.videoSession.update({
          where: { id: session.id },
          data: updateData,
        });
      }

      if (consultation.status === 'SCHEDULED') {
        await prisma.consultation.update({
          where: { id: consultation.id },
          data: {
            status: 'IN_PROGRESS',
            startedAt: now,
          },
        });
      }
    }

    // 6. Generate provider-specific, short-lived signed access token
    const tokenResult = await provider.generateAccessToken(
      user,
      user.role,
      session,
      consultation
    );

    // 7. Audit logging
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'VIDEO_SESSION_JOINED',
        entityType: 'VideoSession',
        entityId: session.id,
        metadata: {
          roomId: session.roomId,
          consultationId: consultation.id,
          role: user.role,
        },
      },
    });

    return {
      session: {
        id: session.id,
        roomId: session.roomId,
        provider: session.provider,
        status: session.status,
        roomUrl: session.roomUrl,
        startedAt: session.startedAt,
      },
      accessToken: tokenResult.token,
      expiresAt: tokenResult.expiresAt,
      permissions: tokenResult.permissions,
    };
  }

  /**
   * Leaves an active video session
   */
  static async leaveSession(user, consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { videoSession: true },
    });

    if (!consultation || !consultation.videoSession) {
      throw ApiError.notFound('Video session not found for this consultation');
    }

    await this.verifyParticipantAuthorization(user, consultation);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'VIDEO_SESSION_LEFT',
        entityType: 'VideoSession',
        entityId: consultation.videoSession.id,
        metadata: {
          roomId: consultation.videoSession.roomId,
          consultationId,
          role: user.role,
        },
      },
    });

    return { success: true, message: 'Successfully disconnected from video room' };
  }

  /**
   * Terminates and closes a video room session (Doctor or Admin only)
   */
  static async endSession(user, consultationId, { reason }) {
    if (user.role === 'PATIENT') {
      throw ApiError.forbidden('Only the assigned doctor or administrator can terminate the video room session');
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { videoSession: true },
    });

    if (!consultation || !consultation.videoSession) {
      throw ApiError.notFound('Video session not found for this consultation');
    }

    await this.verifyParticipantAuthorization(user, consultation);

    const session = consultation.videoSession;

    if (session.status === 'COMPLETED' || session.status === 'TERMINATED') {
      return session;
    }

    const now = new Date();
    const durationSeconds = session.startedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000))
      : 0;

    const provider = getVideoProvider();
    await provider.terminateRoom(session.roomId);

    const updatedSession = await prisma.videoSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        endedAt: now,
        durationSeconds,
        metadata: {
          ...(session.metadata || {}),
          terminationReason: reason || 'Consultation concluded',
          terminatedBy: user.id,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'VIDEO_SESSION_ENDED',
        entityType: 'VideoSession',
        entityId: session.id,
        metadata: {
          roomId: session.roomId,
          consultationId,
          durationSeconds,
          reason,
        },
      },
    });

    return updatedSession;
  }

  /**
   * Retrieves video session status and details
   */
  static async getSession(user, consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { videoSession: true },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    await this.verifyParticipantAuthorization(user, consultation);

    if (!consultation.videoSession) {
      throw ApiError.notFound('No video session has been initialized for this consultation');
    }

    return consultation.videoSession;
  }
}
