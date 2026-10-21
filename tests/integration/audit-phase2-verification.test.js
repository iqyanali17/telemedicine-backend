import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';

describe('Phase 3.1 Verification & Remediation Regression Suite', () => {
  let doctorUser, doctorProfile;
  let patientA, patientB;
  let slotA;
  let consultationA;

  beforeAll(async () => {
    // Setup Doctor
    doctorUser = await prisma.user.create({
      data: {
        email: `audit.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Suresh', lastName: 'Vaidya' } },
        doctorProfile: {
          create: {
            licenseNumber: `AUDIT-LIC-${Date.now()}`,
            specialization: 'Panchakarma',
            experienceYears: 10,
            consultationFee: 750.0,
            qualification: 'BAMS, MD',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    doctorProfile = doctorUser.doctorProfile;

    // Setup Patient A and Patient B
    patientA = await prisma.user.create({
      data: {
        email: `audit.patient.a.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Ramesh', lastName: 'Patel' } },
      },
    });

    patientB = await prisma.user.create({
      data: {
        email: `audit.patient.b.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Deepa', lastName: 'Sharma' } },
      },
    });
  });

  afterAll(async () => {
    await prisma.prescription.deleteMany({ where: { doctorId: doctorProfile.id } });
    await prisma.payment.deleteMany({ where: { patientId: { in: [patientA.id, patientB.id] } } });
    await prisma.consultation.deleteMany({ where: { doctorId: doctorProfile.id } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId: doctorProfile.id } });
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [doctorUser.id, patientA.id, patientB.id] } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [doctorUser.id, patientA.id, patientB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [doctorUser.id, patientA.id, patientB.id] } },
    });
  });

  describe('Finding AUTH-01: Public Self-Registration Strictly Limited to PATIENT Role', () => {
    it('Registration endpoint rejects role="DOCTOR" with 422 Unprocessable Entity', async () => {
      const email = `audit.rogue.doc.${Date.now()}@test.com`;
      const res = await request.post('/api/v1/auth/register').send({
        email,
        password: 'Password123!',
        firstName: 'Impostor',
        lastName: 'Doctor',
        role: 'DOCTOR',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/PATIENT/i);
    });

    it('Registration endpoint without role or with PATIENT succeeds and assigns PATIENT', async () => {
      const email = `audit.legit.pat.${Date.now()}@test.com`;
      const res = await request.post('/api/v1/auth/register').send({
        email,
        password: 'Password123!',
        firstName: 'Legit',
        lastName: 'Patient',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('PATIENT');

      // Cleanup
      await prisma.refreshToken.deleteMany({ where: { userId: res.body.data.user.id } });
      await prisma.user.delete({ where: { id: res.body.data.user.id } });
    });
  });

  describe('Finding SEC-01 & SEC-02: Payment Webhook Cryptographic Verification & State Machine', () => {
    let testConsultation;

    beforeAll(async () => {
      const baseTime = Date.now() + 6000000;
      const slot = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctorProfile.id,
          startTime: new Date(baseTime),
          endTime: new Date(baseTime + 1800000),
          status: 'BOOKED',
        },
      });

      testConsultation = await prisma.consultation.create({
        data: {
          consultationNumber: `AMR-WEBHOOK-${Date.now()}`,
          patientId: patientA.id,
          doctorId: doctorProfile.id,
          slotId: slot.id,
          scheduledAt: slot.startTime,
          status: 'SCHEDULED',
        },
      });
    });

    afterAll(async () => {
      await prisma.payment.deleteMany({ where: { consultationId: testConsultation.id } });
      await prisma.consultation.deleteMany({ where: { id: testConsultation.id } });
      await prisma.availabilitySlot.deleteMany({ where: { id: testConsultation.slotId } });
    });

    const createSignature = (payload) => {
      return crypto
        .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');
    };

    it('Unsigned webhook is rejected with 401 Unauthorized', async () => {
      const res = await request
        .post('/api/v1/payments/webhook')
        .send({
          event: 'payment.captured',
          consultationId: testConsultation.id,
          transactionRef: `FAKE-TXN-${Date.now()}`,
          amount: 750.0,
          status: 'COMPLETED',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/signature missing/i);
    });

    it('Webhook with forged/invalid signature is rejected with 401 Unauthorized', async () => {
      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
        .send({
          event: 'payment.captured',
          consultationId: testConsultation.id,
          transactionRef: `FAKE-TXN-${Date.now()}`,
          amount: 750.0,
          status: 'COMPLETED',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/signature verification failed/i);
    });

    it('Webhook with unreconciled amount (e.g. 1 INR vs 750 INR fee) is rejected with 409 Conflict', async () => {
      const payload = {
        event: 'payment.captured',
        consultationId: testConsultation.id,
        transactionRef: `FAKE-UNDERPAY-${Date.now()}`,
        amount: 1.0, // Fee is 750.0
        status: 'COMPLETED',
      };
      const signature = createSignature(payload);

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/does not reconcile/i);
    });

    it('Authentic signed webhook with matching amount completes payment', async () => {
      const payload = {
        event: 'payment.captured',
        consultationId: testConsultation.id,
        transactionRef: `VALID-TXN-${Date.now()}`,
        amount: 750.0,
        status: 'COMPLETED',
      };
      const signature = createSignature(payload);

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(Number(res.body.data.amount)).toBe(750.0);
    });

    it('Webhook signature verifies against exact raw request body bytes with formatting', async () => {
      const rawJson = `{\n  "event": "payment.captured",\n  "consultationId": "${testConsultation.id}",\n  "transactionRef": "VALID-RAW-TXN-${Date.now()}",\n  "amount": 750,\n  "status": "COMPLETED"\n}`;
      const rawSignature = crypto
        .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
        .update(rawJson)
        .digest('hex');

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', rawSignature)
        .send(rawJson);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Duplicate delivery of COMPLETED webhook returns 200 idempotently', async () => {
      const payload = {
        event: 'payment.captured',
        consultationId: testConsultation.id,
        transactionRef: `VALID-TXN-${Date.now()}`,
        amount: 750.0,
        status: 'COMPLETED',
      };
      const signature = createSignature(payload);

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('Rogue webhook attempting to overwrite COMPLETED to FAILED is rejected with 409', async () => {
      const payload = {
        event: 'payment.failed',
        consultationId: testConsultation.id,
        transactionRef: `LATE-FAIL-${Date.now()}`,
        amount: 750.0,
        status: 'FAILED',
      };
      const signature = createSignature(payload);

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot overwrite a COMPLETED payment/i);
    });

    it('Authentic refund webhook transitions COMPLETED payment to REFUNDED', async () => {
      const payload = {
        event: 'payment.refunded',
        consultationId: testConsultation.id,
        transactionRef: `REFUND-${Date.now()}`,
        amount: 750.0,
        status: 'REFUNDED',
      };
      const signature = createSignature(payload);

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REFUNDED');
    });
  });

  describe('Finding LOGIC-01: Cancelled Slot Rebooking & Associated Consultation Guard', () => {
    it('Cancelling a consultation allows another patient to re-book the slot with 201 Created', async () => {
      // 1. Create a slot
      const t = Date.now() + 7000000;
      slotA = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctorProfile.id,
          startTime: new Date(t),
          endTime: new Date(t + 1800000),
          status: 'AVAILABLE',
        },
      });

      // 2. Patient A books slotA
      const bookRes = await request
        .post('/api/v1/consultations/book')
        .set(getAuthHeader(patientA))
        .send({ slotId: slotA.id });

      expect(bookRes.status).toBe(201);
      consultationA = bookRes.body.data;

      // 3. Patient A cancels consultationA
      const cancelRes = await request
        .patch(`/api/v1/consultations/${consultationA.id}/status`)
        .set(getAuthHeader(patientA))
        .send({
          status: 'CANCELLED',
          cancellationReason: 'Emergency conflict',
        });

      expect(cancelRes.status).toBe(200);

      // Verify slot status in DB was updated to AVAILABLE
      const slotAfterCancel = await prisma.availabilitySlot.findUnique({ where: { id: slotA.id } });
      expect(slotAfterCancel.status).toBe('AVAILABLE');

      // 4. Patient B now successfully books the recycled AVAILABLE slot
      const rebookRes = await request
        .post('/api/v1/consultations/book')
        .set(getAuthHeader(patientB))
        .send({ slotId: slotA.id });

      expect(rebookRes.status).toBe(201);
      expect(rebookRes.body.success).toBe(true);
      expect(rebookRes.body.data.slotId).toBe(slotA.id);
      expect(rebookRes.body.data.patientId).toBe(patientB.id);
    });

    it('Doctor cannot delete an availability slot that has associated consultation history', async () => {
      const res = await request
        .delete(`/api/v1/availability/${slotA.id}`)
        .set(getAuthHeader(doctorUser));

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already been booked|associated consultation/i);
    });
  });

  describe('Finding CLIN-01: Consultation Clinical Eligibility for Prescriptions', () => {
    let noShowConsultation;
    let scheduledConsultation;

    beforeAll(async () => {
      const t = Date.now() + 8000000;
      const slot1 = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctorProfile.id,
          startTime: new Date(t),
          endTime: new Date(t + 1800000),
          status: 'BOOKED',
        },
      });

      const slot2 = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctorProfile.id,
          startTime: new Date(t + 3600000),
          endTime: new Date(t + 5400000),
          status: 'BOOKED',
        },
      });

      noShowConsultation = await prisma.consultation.create({
        data: {
          consultationNumber: `AMR-NOSHOW-${Date.now()}`,
          patientId: patientA.id,
          doctorId: doctorProfile.id,
          slotId: slot1.id,
          scheduledAt: slot1.startTime,
          status: 'NO_SHOW',
        },
      });

      scheduledConsultation = await prisma.consultation.create({
        data: {
          consultationNumber: `AMR-SCHED-${Date.now()}`,
          patientId: patientA.id,
          doctorId: doctorProfile.id,
          slotId: slot2.id,
          scheduledAt: slot2.startTime,
          status: 'SCHEDULED',
        },
      });
    });

    afterAll(async () => {
      await prisma.prescription.deleteMany({
        where: { consultationId: { in: [noShowConsultation.id, scheduledConsultation.id] } },
      });
      await prisma.consultation.deleteMany({
        where: { id: { in: [noShowConsultation.id, scheduledConsultation.id] } },
      });
      await prisma.availabilitySlot.deleteMany({
        where: { id: { in: [noShowConsultation.slotId, scheduledConsultation.slotId] } },
      });
    });

    it('Issuing prescription for a NO_SHOW consultation is rejected with 409 Conflict', async () => {
      const res = await request
        .post('/api/v1/prescriptions')
        .set(getAuthHeader(doctorUser))
        .send({
          consultationId: noShowConsultation.id,
          diagnosis: 'Diagnosed without patient attending',
          medicines: [
            {
              name: 'Ashwagandha Vati',
              dosage: '500mg',
              frequency: 'Once daily',
              duration: '10 days',
            },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/no-show consultation/i);
    });

    it('Issuing prescription for uncommenced SCHEDULED consultation is rejected with 409 Conflict', async () => {
      const res = await request
        .post('/api/v1/prescriptions')
        .set(getAuthHeader(doctorUser))
        .send({
          consultationId: scheduledConsultation.id,
          diagnosis: 'Premature prescription',
          medicines: [
            {
              name: 'Brahmi Vati',
              dosage: '250mg',
              frequency: 'Twice daily',
              duration: '14 days',
            },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/must be started and in-progress/i);
    });
  });

  describe('Finding AUTH-02: Unknown / Ghost Refresh Tokens are Rejected', () => {
    it('Tokens signed with secret but absent from database sessions are rejected with 401', async () => {
      const ghostRefreshToken = jwt.sign(
        { sub: patientA.id, email: patientA.email, role: patientA.role, jti: 'ghost-token-id' },
        env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: ghostRefreshToken });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/unrecognised refresh token/i);
    });
  });

  describe('Finding API-01: Doctor Search Correctly Sorts by name_asc', () => {
    let docAaron, docZara;

    beforeAll(async () => {
      docAaron = await prisma.user.create({
        data: {
          email: `aaron.${Date.now()}@amrutam.test`,
          passwordHash: 'hashed_password',
          role: 'DOCTOR',
          profile: { create: { firstName: 'Aaron', lastName: 'Achar' } },
          doctorProfile: {
            create: {
              licenseNumber: `DOC-AARON-${Date.now()}`,
              specialization: 'Ayurveda Sort Test',
              experienceYears: 2,
              consultationFee: 500,
              qualification: 'BAMS',
              isVerified: true,
            },
          },
        },
        include: { doctorProfile: true },
      });

      docZara = await prisma.user.create({
        data: {
          email: `zara.${Date.now()}@amrutam.test`,
          passwordHash: 'hashed_password',
          role: 'DOCTOR',
          profile: { create: { firstName: 'Zara', lastName: 'Zubair' } },
          doctorProfile: {
            create: {
              licenseNumber: `DOC-ZARA-${Date.now()}`,
              specialization: 'Ayurveda Sort Test',
              experienceYears: 25,
              consultationFee: 900,
              qualification: 'BAMS',
              isVerified: true,
            },
          },
        },
        include: { doctorProfile: true },
      });
    });

    afterAll(async () => {
      await prisma.doctorProfile.deleteMany({
        where: { id: { in: [docAaron.doctorProfile.id, docZara.doctorProfile.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [docAaron.id, docZara.id] } },
      });
    });

    it('Query with sortBy=name_asc correctly orders doctors alphabetically by name', async () => {
      const res = await request.get('/api/v1/doctors?specialization=Ayurveda Sort Test&sortBy=name_asc');

      expect(res.status).toBe(200);
      const items = res.body.data.items || res.body.data;
      expect(items.length).toBe(2);

      // Verify Aaron (A) is first and Zara (Z) is second
      expect(items[0].name).toBe('Aaron Achar');
      expect(items[1].name).toBe('Zara Zubair');
    });
  });
});
