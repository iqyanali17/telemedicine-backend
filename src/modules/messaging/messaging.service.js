import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { AttachmentStorage } from './attachment-storage.js';

export class MessagingService {
  /**
   * Verifies that the authenticated user is an authorized participant in the consultation
   */
  static async verifyParticipant(user, consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: true,
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    if (user.role === 'PATIENT' && consultation.patientId !== user.id) {
      throw ApiError.forbidden('You are not authorized to access this consultation communication');
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Only the assigned doctor can access this consultation communication');
      }
    }

    return consultation;
  }

  /**
   * Sends a secure clinical consultation message
   */
  static async sendMessage(user, consultationId, { content, attachmentId }) {
    const consultation = await this.verifyParticipant(user, consultationId);

    if (consultation.status === 'CANCELLED') {
      throw ApiError.conflict('Cannot send messages for a cancelled consultation');
    }

    if (attachmentId) {
      const attachment = await prisma.medicalAttachment.findUnique({
        where: { id: attachmentId },
      });
      if (!attachment || attachment.consultationId !== consultationId) {
        throw ApiError.notFound('Referenced medical attachment not found for this consultation');
      }
    }

    const messageType = attachmentId ? 'ATTACHMENT' : 'TEXT';

    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.consultationMessage.create({
        data: {
          consultationId,
          senderId: user.id,
          senderRole: user.role,
          content,
          messageType,
          ...(attachmentId
            ? {
                attachments: {
                  connect: { id: attachmentId },
                },
              }
            : {}),
        },
        include: {
          sender: {
            select: {
              id: true,
              role: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          attachments: true,
        },
      });

      // Record audit log without logging medical message text
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CLINICAL_MESSAGE_SENT',
          entityType: 'ConsultationMessage',
          entityId: createdMessage.id,
          metadata: {
            consultationId,
            senderRole: user.role,
            messageType,
            hasAttachment: Boolean(attachmentId),
            contentLength: content.length,
          },
        },
      });

      return createdMessage;
    });

    return message;
  }

  /**
   * Retrieves paginated messages for a consultation with automatic read status advancement
   */
  static async getMessages(user, consultationId, { page = 1, limit = 30, order = 'asc' }) {
    await this.verifyParticipant(user, consultationId);

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.consultationMessage.findMany({
        where: { consultationId },
        skip,
        take: limit,
        orderBy: { createdAt: order },
        include: {
          sender: {
            select: {
              id: true,
              role: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.consultationMessage.count({ where: { consultationId } }),
    ]);

    // Mark unread messages sent by counterparty as read
    const unreadMessageIds = messages
      .filter((m) => m.senderId !== user.id && !m.isRead)
      .map((m) => m.id);

    if (unreadMessageIds.length > 0) {
      await prisma.consultationMessage.updateMany({
        where: { id: { in: unreadMessageIds } },
        data: { isRead: true, readAt: new Date() },
      });
    }

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Uploads and stores a private medical attachment
   */
  static async uploadAttachment(user, consultationId, { fileName, mimeType, fileData }) {
    const consultation = await this.verifyParticipant(user, consultationId);

    if (consultation.status === 'CANCELLED') {
      throw ApiError.conflict('Cannot upload medical attachments for a cancelled consultation');
    }

    // Decode base64 buffer
    let buffer;
    try {
      buffer = Buffer.from(fileData, 'base64');
    } catch {
      throw ApiError.unprocessable('Malformed base64 file data');
    }

    // 10MB file size limit
    const MAX_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw ApiError.unprocessable('File size exceeds the 10MB limit');
    }

    if (buffer.length === 0) {
      throw ApiError.unprocessable('File cannot be empty');
    }

    // Validate magic bytes against MIME type
    AttachmentStorage.validateMagicBytes(buffer, mimeType);

    // Save to private local secure storage
    const storageResult = await AttachmentStorage.saveAttachment(fileName, buffer);

    const attachment = await prisma.medicalAttachment.create({
      data: {
        consultationId,
        uploaderId: user.id,
        fileName: AttachmentStorage.sanitizeFileName(fileName),
        fileKey: storageResult.fileKey,
        fileSize: storageResult.fileSize,
        mimeType,
        storageProvider: 'LOCAL_SECURE',
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'MEDICAL_ATTACHMENT_UPLOADED',
        entityType: 'MedicalAttachment',
        entityId: attachment.id,
        metadata: {
          consultationId,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
        },
      },
    });

    return attachment;
  }

  /**
   * Retrieves a secure stream for downloading a medical attachment
   */
  static async getAttachmentStream(user, consultationId, attachmentId) {
    await this.verifyParticipant(user, consultationId);

    const attachment = await prisma.medicalAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.consultationId !== consultationId) {
      throw ApiError.notFound('Medical attachment not found for this consultation');
    }

    const stream = AttachmentStorage.getAttachmentStream(attachment.fileKey);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'MEDICAL_ATTACHMENT_DOWNLOADED',
        entityType: 'MedicalAttachment',
        entityId: attachment.id,
        metadata: {
          consultationId,
          fileName: attachment.fileName,
        },
      },
    });

    return { stream, attachment };
  }

  /**
   * Lists all medical attachments associated with a consultation
   */
  static async listAttachments(user, consultationId) {
    await this.verifyParticipant(user, consultationId);

    return prisma.medicalAttachment.findMany({
      where: { consultationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        consultationId: true,
        uploaderId: true,
        messageId: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        storageProvider: true,
        createdAt: true,
        uploader: {
          select: {
            id: true,
            role: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }
}
