import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';
import { getPaymentGateway } from '../../src/modules/payments/providers/index.js';
import { env } from '../../src/config/env.js';

describe('Phase 3.4 — Payment Reliability, Reconciliation & Provider Gateway', () => {
  let adminUser;
  let docUser, docProfile;
  let unassignedDocUser;
  let patientUser, unassignedPatient;
  let slotEligible, slotInProgress;
  let eligibleConsultation, inProgressConsultation;
  let eligiblePayment;

  beforeAll(async () => {
    // 1. Admin
    adminUser = await prisma.user.create({
      data: {
        email: `pay.admin.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'ADMIN',
        profile: { create: { firstName: 'System', lastName: 'Auditor' } },
      },
    });

    // 2. Assigned Doctor
    docUser = await prisma.user.create({
      data: {
        email: `pay.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Dhanvantari', lastName: 'Shastri' } },
        doctorProfile: {
          create: {
            licenseNumber: `PAY-DOC-${Date.now()}`,
            specialization: 'Panchakarma',
            consultationFee: 1200.0,
            qualification: 'BAMS, MD',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    docProfile = docUser.doctorProfile;

    // 3. Unassigned Doctor
    unassignedDocUser = await prisma.user.create({
      data: {
        email: `unassigned.pay.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Other', lastName: 'Doctor' } },
        doctorProfile: {
          create: {
            licenseNumber: `PAY-OTHER-${Date.now()}`,
            specialization: 'General',
            consultationFee: 500.0,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
    });

    // 4. Assigned Patient
    patientUser = await prisma.user.create({
      data: {
        email: `pay.patient.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Ananya', lastName: 'Verma' } },
      },
    });

    // 5. Unassigned Patient
    unassignedPatient = await prisma.user.create({
      data: {
        email: `unassigned.pay.pat.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Intruder', lastName: 'Patient' } },
      },
    });

    // 6. Eligible Consultation & Completed Payment (Scheduled in future)
    const now = new Date();
    slotEligible = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now.getTime() + 2 * 3600 * 1000),
        endTime: new Date(now.getTime() + 2.5 * 3600 * 1000),
        status: 'BOOKED',
      },
    });

    eligibleConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `PAY-ELIG-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotEligible.id,
        scheduledAt: slotEligible.startTime,
        status: 'SCHEDULED',
      },
    });

    eligiblePayment = await prisma.payment.create({
      data: {
        consultationId: eligibleConsultation.id,
        patientId: patientUser.id,
        amount: 1200.0,
        currency: 'INR',
        status: 'COMPLETED',
        paymentMethod: 'UPI',
        transactionRef: `TXN-ELIG-${Date.now()}`,
      },
    });

    // 7. In-Progress Consultation & Completed Payment
    slotInProgress = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now.getTime() - 10 * 60 * 1000),
        endTime: new Date(now.getTime() + 30 * 60 * 1000),
        status: 'BOOKED',
      },
    });

    inProgressConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `PAY-INPROG-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotInProgress.id,
        scheduledAt: slotInProgress.startTime,
        status: 'IN_PROGRESS',
      },
    });

    await prisma.payment.create({
      data: {
        consultationId: inProgressConsultation.id,
        patientId: patientUser.id,
        amount: 1200.0,
        currency: 'INR',
        status: 'COMPLETED',
        paymentMethod: 'CARD',
        transactionRef: `TXN-INPROG-${Date.now()}`,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.payment.deleteMany({
        where: { consultationId: { in: [eligibleConsultation?.id, inProgressConsultation?.id].filter(Boolean) } },
      });
      await prisma.consultation.deleteMany({
        where: { id: { in: [eligibleConsultation?.id, inProgressConsultation?.id].filter(Boolean) } },
      });
      await prisma.availabilitySlot.deleteMany({
        where: { id: { in: [slotEligible?.id, slotInProgress?.id].filter(Boolean) } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          userId: {
            in: [adminUser?.id, docUser?.id, unassignedDocUser?.id, patientUser?.id, unassignedPatient?.id].filter(Boolean),
          },
        },
      });
      await prisma.doctorProfile.deleteMany({
        where: { userId: { in: [docUser?.id, unassignedDocUser?.id].filter(Boolean) } },
      });
      await prisma.userProfile.deleteMany({
        where: {
          userId: {
            in: [adminUser?.id, docUser?.id, unassignedDocUser?.id, patientUser?.id, unassignedPatient?.id].filter(Boolean),
          },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [adminUser?.id, docUser?.id, unassignedDocUser?.id, patientUser?.id, unassignedPatient?.id].filter(Boolean),
          },
        },
      });
    } catch {
      // Ignored
    }
  });

  describe('1. Mock Payment Gateway Provider Unit Contracts', () => {
    it('creates deterministic order intent with correct fields', async () => {
      const gateway = getPaymentGateway();
      const order = await gateway.createOrder({
        amount: 1200,
        currency: 'INR',
        receipt: 'RCP-001',
      });

      expect(order.orderId).toMatch(/^order_mock_/);
      expect(order.amount).toBe(1200);
      expect(order.currency).toBe('INR');
      expect(order.status).toBe('created');
      expect(order.provider).toBe('MOCK_GATEWAY');
    });

    it('processes mock refund generating verifiable refund reference', async () => {
      const gateway = getPaymentGateway();
      const refund = await gateway.processRefund({
        transactionRef: 'TXN-MOCK-12345',
        amount: 1200,
        reason: 'Patient cancellation',
      });

      expect(refund.success).toBe(true);
      expect(refund.refundRef).toMatch(/^rfnd_mock_/i);
      expect(refund.status).toBe('processed');
      expect(refund.amount).toBe(1200);
    });

    it('validates HMAC webhook signatures and rejects tampered payloads', () => {
      const gateway = getPaymentGateway();
      const secret = env.PAYMENT_WEBHOOK_SECRET;
      const payload = JSON.stringify({ event: 'payment.captured', amount: 1200 });

      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      expect(gateway.verifyWebhookSignature(payload, signature, secret)).toBe(true);
      expect(gateway.verifyWebhookSignature(payload, 'tampered_signature', secret)).toBe(false);
    });
  });

  describe('2. Automated Refund Workflow (POST /payments/:consultationId/refund)', () => {
    it('rejects unauthenticated refund requests (401)', async () => {
      const res = await request
        .post(`/api/v1/payments/${eligibleConsultation.id}/refund`)
        .send({ reason: 'Changed mind' });

      expect(res.status).toBe(401);
    });

    it('rejects unassigned patient from requesting refund (403)', async () => {
      const res = await request
        .post(`/api/v1/payments/${eligibleConsultation.id}/refund`)
        .set(getAuthHeader(unassignedPatient))
        .send({ reason: 'Unauthorized attempt' });

      expect(res.status).toBe(403);
    });

    it('rejects unassigned doctor from requesting refund (403)', async () => {
      const res = await request
        .post(`/api/v1/payments/${eligibleConsultation.id}/refund`)
        .set(getAuthHeader(unassignedDocUser))
        .send({ reason: 'Unauthorized doctor' });

      expect(res.status).toBe(403);
    });

    it('rejects patient refund for consultation already IN_PROGRESS (409)', async () => {
      const res = await request
        .post(`/api/v1/payments/${inProgressConsultation.id}/refund`)
        .set(getAuthHeader(patientUser))
        .send({ reason: 'Too late to cancel' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already in progress or completed/i);
    });

    it('fails gracefully and preserves COMPLETED status if provider throws/times out during refund', async () => {
      const gateway = getPaymentGateway();
      const originalRefund = gateway.processRefund;
      gateway.processRefund = async () => {
        throw new Error('Payment gateway timeout');
      };

      try {
        const res = await request
          .post(`/api/v1/payments/${eligibleConsultation.id}/refund`)
          .set(getAuthHeader(patientUser))
          .send({ reason: 'Test provider timeout' });

        expect(res.status).toBe(500);

        // Verify payment in DB is still COMPLETED and not corrupted
        const payment = await prisma.payment.findUnique({
          where: { consultationId: eligibleConsultation.id },
        });
        expect(payment.status).toBe('COMPLETED');
      } finally {
        gateway.processRefund = originalRefund;
      }
    });

    it('successfully refunds eligible consultation, cancels consultation, and releases slot', async () => {
      const res = await request
        .post(`/api/v1/payments/${eligibleConsultation.id}/refund`)
        .set(getAuthHeader(patientUser))
        .send({ reason: 'Family emergency' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REFUNDED');
      expect(res.body.data.refundRef).toBeDefined();
      expect(res.body.data.refundedAt).not.toBeNull();

      // Check consultation transitioned to CANCELLED
      const updatedConsultation = await prisma.consultation.findUnique({
        where: { id: eligibleConsultation.id },
      });
      expect(updatedConsultation.status).toBe('CANCELLED');
      expect(updatedConsultation.cancellationReason).toContain('Family emergency');

      // Check availability slot was released back to AVAILABLE
      const updatedSlot = await prisma.availabilitySlot.findUnique({
        where: { id: slotEligible.id },
      });
      expect(updatedSlot.status).toBe('AVAILABLE');

      // Verify AuditLog was created
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: eligiblePayment.id, action: 'PAYMENT_REFUND_PROCESSED' },
      });
      expect(audit).not.toBeNull();
      expect(audit.metadata.refundRef).toBe(res.body.data.refundRef);
    });

    it('executes subsequent refund idempotently returning existing refund record', async () => {
      const res = await request
        .post(`/api/v1/payments/${eligibleConsultation.id}/refund`)
        .set(getAuthHeader(patientUser))
        .send({ reason: 'Duplicate retry' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REFUNDED');
      expect(res.body.data.alreadyRefunded).toBe(true);
    });
  });

  describe('3. Payment Financial Reconciliation & Auditing (GET /payments/reconciliation)', () => {
    it('restricts reconciliation endpoint from patients (403 Forbidden)', async () => {
      const res = await request
        .get('/api/v1/payments/reconciliation')
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(403);
    });

    it('restricts reconciliation endpoint from doctors (403 Forbidden)', async () => {
      const res = await request
        .get('/api/v1/payments/reconciliation')
        .set(getAuthHeader(docUser));

      expect(res.status).toBe(403);
    });

    it('allows Admin to retrieve reconciliation report with financial summary metrics', async () => {
      const res = await request
        .get('/api/v1/payments/reconciliation?page=1&limit=20')
        .set(getAuthHeader(adminUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();

      const { summary } = res.body.data;
      expect(summary.totalTransactions).toBeGreaterThanOrEqual(2);
      expect(summary.completedCount).toBeGreaterThanOrEqual(1);
      expect(summary.refundedCount).toBeGreaterThanOrEqual(1);
      expect(typeof summary.netRevenue).toBe('number');
      expect(summary.netRevenue).toBe(Number((summary.completedAmount - summary.refundedAmount).toFixed(2)));

      expect(Array.isArray(res.body.data.transactions)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('supports filtering reconciliation report by status', async () => {
      const res = await request
        .get('/api/v1/payments/reconciliation?status=REFUNDED')
        .set(getAuthHeader(adminUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions.every((tx) => tx.status === 'REFUNDED')).toBe(true);
    });
  });

  describe('4. Durable Refund Recovery, Partial Failure & Provider Readiness', () => {
    let partialSlot, partialConsultation, partialPayment;

    beforeAll(async () => {
      const now = new Date();
      partialSlot = await prisma.availabilitySlot.create({
        data: {
          doctorId: docProfile.id,
          startTime: new Date(now.getTime() + 10 * 3600 * 1000),
          endTime: new Date(now.getTime() + 10.5 * 3600 * 1000),
          status: 'BOOKED',
        },
      });

      partialConsultation = await prisma.consultation.create({
        data: {
          consultationNumber: `PAY-PARTIAL-${Date.now()}`,
          patientId: patientUser.id,
          doctorId: docProfile.id,
          slotId: partialSlot.id,
          scheduledAt: partialSlot.startTime,
          status: 'SCHEDULED',
        },
      });

      partialPayment = await prisma.payment.create({
        data: {
          consultationId: partialConsultation.id,
          patientId: patientUser.id,
          amount: 1200.0,
          currency: 'INR',
          status: 'COMPLETED',
          paymentMethod: 'UPI',
          transactionRef: `TXN-PARTIAL-${Date.now()}`,
        },
      });
    });

    afterAll(async () => {
      try {
        await prisma.refundOperation.deleteMany({
          where: { consultationId: partialConsultation?.id },
        });
        await prisma.payment.deleteMany({
          where: { consultationId: partialConsultation?.id },
        });
        await prisma.consultation.deleteMany({
          where: { id: partialConsultation?.id },
        });
        await prisma.availabilitySlot.deleteMany({
          where: { id: partialSlot?.id },
        });
      } catch {
        // Ignored
      }
    });

    it('recovers from partial failure when provider succeeded but DB commit stalled without double-refunding', async () => {
      const idempotencyKey = `refund_${partialConsultation.id}_${partialPayment.id}`;
      const mockPriorRefundRef = `rfnd_mock_prior_${Date.now()}`;

      // Simulate partial failure: RefundOperation exists with refundRef but payment is still COMPLETED
      await prisma.refundOperation.create({
        data: {
          paymentId: partialPayment.id,
          consultationId: partialConsultation.id,
          amount: partialPayment.amount,
          reason: 'Partial failure simulation',
          status: 'PENDING',
          idempotencyKey,
          refundRef: mockPriorRefundRef,
          attempts: 1,
        },
      });

      // Track gateway calls to verify it is NOT re-invoked
      const gateway = getPaymentGateway();
      let gatewayCallCount = 0;
      const originalRefund = gateway.processRefund;
      gateway.processRefund = async (...args) => {
        gatewayCallCount++;
        return originalRefund.apply(gateway, args);
      };

      try {
        const { PaymentService } = await import('../../src/modules/payments/payment.service.js');
        const result = await PaymentService.processRefund(patientUser, partialConsultation.id, {
          reason: 'Retry after crash',
        });

        // Gateway must NOT have been called again (zero double refunds!)
        expect(gatewayCallCount).toBe(0);

        // Result uses the existing refund reference
        expect(result.status).toBe('REFUNDED');
        expect(result.refundRef).toBe(mockPriorRefundRef);

        // RefundOperation marked COMPLETED in database
        const op = await prisma.refundOperation.findUnique({ where: { idempotencyKey } });
        expect(op.status).toBe('COMPLETED');
      } finally {
        gateway.processRefund = originalRefund;
      }
    });

    it('reconciles incomplete pending refund operations via reconcileIncompleteRefunds', async () => {
      // Create a stalled pending refund operation with a refund reference
      const now = new Date();
      const reconSlot = await prisma.availabilitySlot.create({
        data: {
          doctorId: docProfile.id,
          startTime: new Date(now.getTime() + 15 * 3600 * 1000),
          endTime: new Date(now.getTime() + 15.5 * 3600 * 1000),
          status: 'BOOKED',
        },
      });

      const reconConsultation = await prisma.consultation.create({
        data: {
          consultationNumber: `PAY-RECON-${Date.now()}`,
          patientId: patientUser.id,
          doctorId: docProfile.id,
          slotId: reconSlot.id,
          scheduledAt: reconSlot.startTime,
          status: 'SCHEDULED',
        },
      });

      const reconPayment = await prisma.payment.create({
        data: {
          consultationId: reconConsultation.id,
          patientId: patientUser.id,
          amount: 1200.0,
          currency: 'INR',
          status: 'COMPLETED',
          paymentMethod: 'UPI',
          transactionRef: `TXN-RECON-${Date.now()}`,
        },
      });

      const reconOpKey = `refund_recon_${Date.now()}`;
      const mockReconRef = `rfnd_mock_recon_${Date.now()}`;

      await prisma.refundOperation.create({
        data: {
          paymentId: reconPayment.id,
          consultationId: reconConsultation.id,
          amount: reconPayment.amount,
          reason: 'Stalled before commit',
          status: 'PENDING',
          idempotencyKey: reconOpKey,
          refundRef: mockReconRef,
        },
      });

      const { PaymentService } = await import('../../src/modules/payments/payment.service.js');
      const reconResult = await PaymentService.reconcileIncompleteRefunds();

      expect(reconResult.reconciledCount).toBeGreaterThanOrEqual(1);

      // Verify payment was transitioned to REFUNDED
      const updatedPayment = await prisma.payment.findUnique({
        where: { id: reconPayment.id },
      });
      expect(updatedPayment.status).toBe('REFUNDED');
      expect(updatedPayment.refundRef).toBe(mockReconRef);

      // Cleanup
      await prisma.refundOperation.deleteMany({ where: { consultationId: reconConsultation.id } });
      await prisma.payment.deleteMany({ where: { consultationId: reconConsultation.id } });
      await prisma.consultation.deleteMany({ where: { id: reconConsultation.id } });
      await prisma.availabilitySlot.deleteMany({ where: { id: reconSlot.id } });
    });

    it('verifies Razorpay live adapter requires production keys and rejects unconfigured usage', async () => {
      const { RazorpayGateway } = await import('../../src/modules/payments/providers/razorpay-gateway.js');

      // Instantiating without environment keys throws clear configuration error
      expect(() => new RazorpayGateway({ keyId: null, keySecret: null })).toThrow(
        /RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set/i
      );
    });
  });
});
