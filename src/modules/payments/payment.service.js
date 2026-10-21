import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { getPaymentGateway } from './providers/index.js';
import { NotificationDispatcher } from '../notifications/notification.dispatcher.js';

export class PaymentService {
  static async initiatePayment(patientId, { consultationId, paymentMethod }) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: true,
        payment: true,
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    if (consultation.patientId !== patientId) {
      throw ApiError.forbidden('You are not authorized to pay for this consultation');
    }

    if (consultation.payment && consultation.payment.status === 'COMPLETED') {
      throw ApiError.conflict('Payment for this consultation is already completed');
    }

    const transactionRef = `TXN-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    return prisma.payment.upsert({
      where: { consultationId },
      update: {
        paymentMethod,
        transactionRef,
        status: 'PENDING',
      },
      create: {
        consultationId,
        patientId,
        amount: consultation.doctor.consultationFee,
        currency: 'INR',
        status: 'PENDING',
        paymentMethod,
        transactionRef,
      },
    });
  }

  static async getPaymentStatus(user, consultationId) {
    const payment = await prisma.payment.findUnique({
      where: { consultationId },
    });

    if (!payment) {
      throw ApiError.notFound('Payment record not found');
    }

    if (user.role === 'PATIENT' && payment.patientId !== user.id) {
      throw ApiError.forbidden('Unauthorized access to payment details');
    }

    if (user.role === 'DOCTOR') {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationId },
      });
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!consultation || !doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Unauthorized access to payment details');
      }
    }

    return payment;
  }

  /**
   * Processes incoming payment provider webhook with idempotency and state guards
   */
  static async processWebhook({ event, consultationId, transactionRef, status, amount }) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        payment: true,
        doctor: { select: { consultationFee: true } },
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation referenced in webhook not found');
    }

    const currentPayment = consultation.payment;
    const requiredAmount = Number(consultation.doctor.consultationFee);
    const incomingAmount = Number(amount);

    // 1. Amount reconciliation for captured/completed payments
    if (status === 'COMPLETED' || event === 'payment.captured') {
      if (Math.abs(incomingAmount - requiredAmount) > 0.01) {
        throw ApiError.conflict(
          `Payment amount (${incomingAmount}) does not reconcile with required fee (${requiredAmount})`
        );
      }
    }

    // 2. State machine guards & duplicate event idempotency
    if (currentPayment) {
      // Idempotency: duplicate delivery of identical terminal event
      if (currentPayment.status === status && currentPayment.transactionRef === transactionRef) {
        return currentPayment;
      }

      if (currentPayment.status === 'COMPLETED') {
        if (status === 'COMPLETED') {
          // Idempotent return if already completed
          return currentPayment;
        }
        if (status === 'FAILED') {
          throw ApiError.conflict('Cannot overwrite a COMPLETED payment with FAILED status');
        }
        // status === 'REFUNDED' is allowed to proceed
      } else if (currentPayment.status === 'REFUNDED') {
        if (status === 'REFUNDED') return currentPayment;
        throw ApiError.conflict('Payment has already reached terminal REFUNDED status');
      } else if (status === 'REFUNDED') {
        throw ApiError.conflict('Cannot process refund for an uncompleted payment');
      }
    } else if (status === 'REFUNDED') {
      throw ApiError.conflict('Cannot refund a non-existent payment');
    }

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.upsert({
        where: { consultationId },
        update: {
          status,
          transactionRef,
          amount,
        },
        create: {
          consultationId,
          patientId: consultation.patientId,
          amount,
          currency: 'INR',
          status,
          transactionRef,
        },
      });

      // Record audit log
      await tx.auditLog.create({
        data: {
          userId: consultation.patientId,
          action: 'PAYMENT_WEBHOOK_PROCESSED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            event,
            previousStatus: currentPayment?.status || null,
            newStatus: status,
            transactionRef,
            amount,
          },
        },
      });

      return payment;
    });
  }

  /**
   * Process refund for a completed consultation payment
   */
  static async processRefund(user, consultationId, { reason = 'Consultation cancelled' } = {}) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        payment: true,
        patient: true,
        slot: true,
        doctor: { select: { id: true, userId: true } },
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    // Role-based authorization
    if (user.role === 'PATIENT' && consultation.patientId !== user.id) {
      throw ApiError.forbidden('You are not authorized to request a refund for this consultation');
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || consultation.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Only the assigned doctor or patient can initiate a refund');
      }
    }

    const payment = consultation.payment;
    if (!payment) {
      throw ApiError.notFound('No payment record found for this consultation');
    }

    // Idempotent return if already refunded
    if (payment.status === 'REFUNDED') {
      return {
        ...payment,
        alreadyRefunded: true,
      };
    }

    if (payment.status !== 'COMPLETED') {
      throw ApiError.conflict('Only completed payments can be refunded');
    }

    // If patient requests refund, verify consultation lifecycle eligibility
    if (user.role === 'PATIENT' && ['IN_PROGRESS', 'COMPLETED'].includes(consultation.status)) {
      throw ApiError.conflict('Cannot refund a consultation that is already in progress or completed');
    }

    const idempotencyKey = `refund_${consultationId}_${payment.id}`;

    // 1. Check for existing durable RefundOperation
    let refundOp = await prisma.refundOperation.findUnique({
      where: { idempotencyKey },
    });

    if (refundOp && refundOp.status === 'COMPLETED') {
      return {
        ...payment,
        status: 'REFUNDED',
        refundRef: refundOp.refundRef,
        alreadyRefunded: true,
      };
    }

    let gatewayResult;

    if (refundOp && refundOp.refundRef) {
      // PARTIAL FAILURE RECOVERY: Gateway already succeeded previously, but DB transaction did not complete!
      // Reuse the existing refundRef without charging/refunding the gateway again!
      gatewayResult = {
        success: true,
        refundRef: refundOp.refundRef,
        transactionRef: payment.transactionRef,
        amount: Number(payment.amount),
      };
    } else {
      // Ensure durable record exists before upstream gateway call
      if (!refundOp) {
        refundOp = await prisma.refundOperation.create({
          data: {
            paymentId: payment.id,
            consultationId,
            amount: payment.amount,
            reason,
            status: 'PENDING',
            idempotencyKey,
          },
        });
      }

      // Invoke payment gateway provider to execute upstream refund with idempotency
      const gateway = getPaymentGateway();
      try {
        gatewayResult = await gateway.processRefund({
          transactionRef: payment.transactionRef,
          amount: Number(payment.amount),
          reason,
          idempotencyKey,
        });
      } catch (err) {
        await prisma.refundOperation.update({
          where: { id: refundOp.id },
          data: {
            errorMessage: err.message,
            attempts: { increment: 1 },
          },
        });
        throw err;
      }

      // Record upstream refundRef into durable RefundOperation before starting DB transaction
      await prisma.refundOperation.update({
        where: { id: refundOp.id },
        data: {
          refundRef: gatewayResult.refundRef,
          attempts: { increment: 1 },
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Payment record to REFUNDED
      const updatedPayment = await tx.payment.update({
        where: { consultationId },
        data: {
          status: 'REFUNDED',
          refundRef: gatewayResult.refundRef,
          refundReason: reason,
          refundedAt: new Date(),
        },
      });

      // 2. Mark RefundOperation as COMPLETED
      await tx.refundOperation.update({
        where: { id: refundOp.id },
        data: {
          status: 'COMPLETED',
          errorMessage: null,
        },
      });

      // 3. If consultation is still active, cancel it and release slot
      if (['REQUESTED', 'SCHEDULED'].includes(consultation.status)) {
        await tx.consultation.update({
          where: { id: consultationId },
          data: {
            status: 'CANCELLED',
            cancellationReason: `Cancelled due to refund: ${reason}`,
          },
        });

        if (consultation.slotId) {
          await tx.availabilitySlot.update({
            where: { id: consultation.slotId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      // 4. Record AuditLog
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'PAYMENT_REFUND_PROCESSED',
          entityType: 'Payment',
          entityId: updatedPayment.id,
          metadata: {
            consultationId,
            refundRef: gatewayResult.refundRef,
            amount: Number(payment.amount),
            reason,
            actorRole: user.role,
            idempotencyKey,
          },
        },
      });

      return updatedPayment;
    });

    NotificationDispatcher.notifyPaymentRefunded(result, consultation);

    return result;
  }

  /**
   * Reconciles any incomplete refund operations where provider succeeded but DB commit stalled
   */
  static async reconcileIncompleteRefunds() {
    const pendingWithRef = await prisma.refundOperation.findMany({
      where: {
        status: 'PENDING',
        refundRef: { not: null },
      },
      include: {
        payment: {
          include: {
            consultation: true,
          },
        },
      },
    });

    const reconciled = [];

    for (const op of pendingWithRef) {
      const consultation = op.payment.consultation;
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: op.paymentId },
          data: {
            status: 'REFUNDED',
            refundRef: op.refundRef,
            refundReason: op.reason,
            refundedAt: new Date(),
          },
        });

        await tx.refundOperation.update({
          where: { id: op.id },
          data: { status: 'COMPLETED' },
        });

        if (['REQUESTED', 'SCHEDULED'].includes(consultation.status)) {
          await tx.consultation.update({
            where: { id: consultation.id },
            data: {
              status: 'CANCELLED',
              cancellationReason: `Reconciled refund: ${op.reason}`,
            },
          });

          if (consultation.slotId) {
            await tx.availabilitySlot.update({
              where: { id: consultation.slotId },
              data: { status: 'AVAILABLE' },
            });
          }
        }
      });
      reconciled.push({ refundOperationId: op.id, refundRef: op.refundRef });
    }

    return {
      reconciledCount: reconciled.length,
      operations: reconciled,
    };
  }

  /**
   * Generates payment reconciliation report and transaction audit
   */
  static async getReconciliationReport({ startDate, endDate, status, page = 1, limit = 20 }) {
    const where = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [payments, total, allStatusSummary] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          consultation: {
            select: {
              id: true,
              consultationNumber: true,
              status: true,
              doctor: {
                select: {
                  id: true,
                  consultationFee: true,
                  user: {
                    select: {
                      profile: { select: { firstName: true, lastName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { amount: true },
        where: startDate || endDate ? { createdAt: where.createdAt } : {},
      }),
    ]);

    // Compute summary metrics
    const summary = {
      totalTransactions: 0,
      completedCount: 0,
      completedAmount: 0,
      refundedCount: 0,
      refundedAmount: 0,
      failedCount: 0,
      pendingCount: 0,
      netRevenue: 0,
    };

    allStatusSummary.forEach((group) => {
      const count = group._count.id;
      const amount = Number(group._sum.amount || 0);
      summary.totalTransactions += count;

      if (group.status === 'COMPLETED') {
        summary.completedCount = count;
        summary.completedAmount = amount;
      } else if (group.status === 'REFUNDED') {
        summary.refundedCount = count;
        summary.refundedAmount = amount;
      } else if (group.status === 'FAILED') {
        summary.failedCount = count;
      } else if (group.status === 'PENDING') {
        summary.pendingCount = count;
      }
    });

    summary.netRevenue = Number((summary.completedAmount - summary.refundedAmount).toFixed(2));

    // Identify discrepancies (e.g. captured amount != doctor fee)
    const discrepancies = payments
      .filter((p) => {
        if (p.status === 'COMPLETED' && p.consultation?.doctor) {
          const expectedFee = Number(p.consultation.doctor.consultationFee);
          const actualAmount = Number(p.amount);
          return Math.abs(actualAmount - expectedFee) > 0.01;
        }
        return false;
      })
      .map((p) => ({
        paymentId: p.id,
        consultationId: p.consultationId,
        expectedAmount: Number(p.consultation.doctor.consultationFee),
        actualAmount: Number(p.amount),
        type: 'AMOUNT_MISMATCH',
      }));

    return {
      summary,
      discrepancies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      transactions: payments,
    };
  }
}

