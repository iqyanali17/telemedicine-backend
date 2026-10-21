import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { EmailChannel } from './channels/email-channel.js';
import { SmsChannel } from './channels/sms-channel.js';
import { notificationQueueWorker } from './notification-queue.worker.js';

class NotificationDispatcherClass {
  constructor() {
    this.emailChannel = new EmailChannel();
    this.smsChannel = new SmsChannel();
    this.worker = notificationQueueWorker;
  }

  /**
   * Dispatches a notification durably to PostgreSQL-backed queue with deduplication
   */
  async dispatch({
    userId,
    type,
    channel = 'IN_APP',
    recipient,
    subject = null,
    content,
    metadata = null,
    idempotencyKey = null,
    maxAttempts = 3,
  }) {
    try {
      // 1. Idempotency Check: Prevent duplicate queuing
      if (idempotencyKey) {
        const existing = await prisma.notification.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return existing;
        }
      }

      // 2. Persist durably into PostgreSQL as PENDING
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          channel,
          recipient: recipient || 'system',
          subject,
          content,
          status: 'PENDING',
          metadata: metadata || undefined,
          idempotencyKey,
          maxAttempts,
          attempts: 0,
          nextRetryAt: new Date(),
        },
      });

      // 3. Trigger immediate worker processing cycle asynchronously
      setImmediate(() => {
        this.worker.processDueJobs().catch((err) => {
          logger.error({ err }, 'Notification worker process cycle failed');
        });
      });

      return notification;
    } catch (err) {
      // Handle race condition on unique idempotencyKey
      if (err.code === 'P2002' && idempotencyKey) {
        return prisma.notification.findUnique({ where: { idempotencyKey } });
      }
      logger.error({ err, userId, type, channel }, 'Failed to durably enqueue notification');
      throw err;
    }
  }

  /**
   * Immediately processes due jobs synchronously (useful for test assertions)
   */
  async processQueueNow() {
    return this.worker.processDueJobs();
  }

  /**
   * Booking confirmed notification for Patient and Doctor
   */
  async notifyBookingConfirmed(consultation) {
    if (!consultation) return;

    const patient = consultation.patient;
    const doctorUser = consultation.doctor?.user;

    // 1. Notify Patient
    if (patient) {
      await this.dispatch({
        userId: patient.id,
        type: 'BOOKING_CONFIRMED',
        channel: 'IN_APP',
        recipient: patient.email,
        subject: 'Consultation Booking Confirmed',
        content: `Your consultation ${consultation.consultationNumber} has been scheduled successfully.`,
        metadata: {
          consultationId: consultation.id,
          consultationNumber: consultation.consultationNumber,
          scheduledAt: consultation.scheduledAt,
        },
        idempotencyKey: `booking_${consultation.id}_${patient.id}_IN_APP`,
      });

      if (patient.email) {
        await this.dispatch({
          userId: patient.id,
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          recipient: patient.email,
          subject: `Amrutam: Consultation Confirmed (${consultation.consultationNumber})`,
          content: `Your Ayurvedic consultation #${consultation.consultationNumber} is confirmed for ${consultation.scheduledAt}.`,
          metadata: { consultationId: consultation.id },
          idempotencyKey: `booking_${consultation.id}_${patient.id}_EMAIL`,
        });
      }
    }

    // 2. Notify Doctor
    if (doctorUser) {
      await this.dispatch({
        userId: doctorUser.id,
        type: 'BOOKING_CONFIRMED',
        channel: 'IN_APP',
        recipient: doctorUser.email,
        subject: 'New Patient Consultation Booked',
        content: `A new consultation ${consultation.consultationNumber} has been scheduled on your calendar.`,
        metadata: {
          consultationId: consultation.id,
          consultationNumber: consultation.consultationNumber,
        },
        idempotencyKey: `booking_${consultation.id}_${doctorUser.id}_IN_APP`,
      });
    }
  }

  /**
   * Consultation cancelled notification for Patient and Doctor
   */
  async notifyCancellation(consultation, reason = 'Cancelled by user') {
    if (!consultation) return;

    const patient = consultation.patient;
    const doctorUser = consultation.doctor?.user;

    if (patient) {
      await this.dispatch({
        userId: patient.id,
        type: 'CONSULTATION_CANCELLED',
        channel: 'IN_APP',
        recipient: patient.email,
        subject: 'Consultation Cancelled',
        content: `Consultation ${consultation.consultationNumber} was cancelled. Reason: ${reason}`,
        metadata: {
          consultationId: consultation.id,
          reason,
        },
        idempotencyKey: `cancel_${consultation.id}_${patient.id}_IN_APP`,
      });
    }

    if (doctorUser) {
      await this.dispatch({
        userId: doctorUser.id,
        type: 'CONSULTATION_CANCELLED',
        channel: 'IN_APP',
        recipient: doctorUser.email,
        subject: 'Consultation Cancelled',
        content: `Consultation ${consultation.consultationNumber} has been cancelled.`,
        metadata: {
          consultationId: consultation.id,
          reason,
        },
        idempotencyKey: `cancel_${consultation.id}_${doctorUser.id}_IN_APP`,
      });
    }
  }

  /**
   * Prescription issued notification for Patient
   */
  async notifyPrescriptionIssued(prescription, consultation) {
    if (!consultation || !consultation.patient) return;

    await this.dispatch({
      userId: consultation.patient.id,
      type: 'PRESCRIPTION_ISSUED',
      channel: 'IN_APP',
      recipient: consultation.patient.email,
      subject: 'Prescription Available',
      content: `Dr. ${consultation.doctor?.user?.profile?.lastName || ''} has issued your prescription for consultation ${consultation.consultationNumber}.`,
      metadata: {
        consultationId: consultation.id,
        prescriptionId: prescription.id,
      },
      idempotencyKey: `presc_${prescription.id}_${consultation.patient.id}_IN_APP`,
    });
  }

  /**
   * Payment refund notification for Patient
   */
  async notifyPaymentRefunded(payment, consultation) {
    if (!consultation || !consultation.patient) return;

    await this.dispatch({
      userId: consultation.patient.id,
      type: 'PAYMENT_REFUNDED',
      channel: 'IN_APP',
      recipient: consultation.patient.email,
      subject: 'Payment Refund Processed',
      content: `A refund of INR ${payment.amount} for consultation ${consultation.consultationNumber} has been initiated (Ref: ${payment.refundRef || 'N/A'}).`,
      metadata: {
        consultationId: consultation.id,
        paymentId: payment.id,
        refundRef: payment.refundRef,
        amount: Number(payment.amount),
      },
      idempotencyKey: `refund_${payment.id}_${consultation.patient.id}_IN_APP`,
    });
  }

  /**
   * Upcoming appointment reminder notification
   */
  async notifyUpcomingReminder(consultation) {
    if (!consultation || !consultation.patient) return;

    await this.dispatch({
      userId: consultation.patient.id,
      type: 'UPCOMING_REMINDER',
      channel: 'IN_APP',
      recipient: consultation.patient.email,
      subject: 'Upcoming Consultation Reminder',
      content: `Your consultation ${consultation.consultationNumber} is scheduled to start soon.`,
      metadata: {
        consultationId: consultation.id,
        consultationNumber: consultation.consultationNumber,
        scheduledAt: consultation.scheduledAt,
      },
      idempotencyKey: `reminder_${consultation.id}_${consultation.patient.id}_IN_APP`,
    });
  }
}

export const NotificationDispatcher = new NotificationDispatcherClass();

