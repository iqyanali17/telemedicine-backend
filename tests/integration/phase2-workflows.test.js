import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';

describe('Phase 2 Core Workflows: Lifecycle, Search, PDF & Webhooks', () => {
  let doctorUser, doctorProfile;
  let patientUser;
  let slotA, slotB;
  let consultation;
  let prescription;

  beforeAll(async () => {
    // 1. Create Doctor
    doctorUser = await prisma.user.create({
      data: {
        email: `phase2.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pass',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Siddharth', lastName: 'Nair' } },
        doctorProfile: {
          create: {
            licenseNumber: `P2-DOC-${Date.now()}`,
            specialization: 'Ayurvedic Kayachikitsa & Wellness',
            experienceYears: 12,
            consultationFee: 850.0,
            qualification: 'BAMS, MD',
            bio: 'Expert in stress, anxiety, and metabolism management.',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    doctorProfile = doctorUser.doctorProfile;

    // 2. Create Patient
    patientUser = await prisma.user.create({
      data: {
        email: `phase2.patient.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pass',
        role: 'PATIENT',
        profile: { create: { firstName: 'Kavita', lastName: 'Menon' } },
      },
    });

    // 3. Create Slots
    const baseTime = Date.now() + 5000000;
    slotA = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime: new Date(baseTime),
        endTime: new Date(baseTime + 1800000),
        status: 'AVAILABLE',
      },
    });

    slotB = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime: new Date(baseTime + 3600000),
        endTime: new Date(baseTime + 5400000),
        status: 'AVAILABLE',
      },
    });
  });

  afterAll(async () => {
    if (prescription?.id) {
      await prisma.prescription.deleteMany({ where: { doctorId: doctorProfile.id } });
    }
    await prisma.payment.deleteMany({ where: { patientId: patientUser.id } });
    await prisma.consultation.deleteMany({ where: { doctorId: doctorProfile.id } });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId: doctorProfile.id } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [doctorUser.id, patientUser.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [doctorUser.id, patientUser.id] } } });
  });

  describe('1. Advanced Doctor Search & Filters', () => {
    it('GET /api/v1/doctors with text query should return matching doctors', async () => {
      const res = await request.get('/api/v1/doctors?q=Kayachikitsa');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].specialization).toMatch(/Kayachikitsa/i);
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('GET /api/v1/doctors with fee range filter should apply bounds', async () => {
      const res = await request.get('/api/v1/doctors?minFee=800&maxFee=900');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const match = res.body.data.items.find((d) => d.id === doctorProfile.id);
      expect(match).toBeDefined();
    });

    it('GET /api/v1/doctors with sorting fee_desc should return ordered results', async () => {
      const res = await request.get('/api/v1/doctors?sortBy=fee_desc');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });
  });

  describe('2. Consultation Lifecycle & Transitions', () => {
    it('Patient books a consultation in slotA', async () => {
      const res = await request
        .post('/api/v1/consultations/book')
        .set(getAuthHeader(patientUser))
        .send({
          slotId: slotA.id,
          notes: 'Consultation for chronic fatigue',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SCHEDULED');
      consultation = res.body.data;
    });

    it('Patient attempting to transition consultation to IN_PROGRESS should receive 403 Forbidden', async () => {
      const res = await request
        .patch(`/api/v1/consultations/${consultation.id}/status`)
        .set(getAuthHeader(patientUser))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(403);
    });

    it('Doctor transitions consultation to IN_PROGRESS', async () => {
      const res = await request
        .patch(`/api/v1/consultations/${consultation.id}/status`)
        .set(getAuthHeader(doctorUser))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.startedAt).toBeDefined();
    });

    it('Doctor issues prescription and consultation transitions to COMPLETED', async () => {
      const res = await request
        .post('/api/v1/prescriptions')
        .set(getAuthHeader(doctorUser))
        .send({
          consultationId: consultation.id,
          diagnosis: 'Vata-Pitta Dushti with Agnimandya',
          medicines: [
            {
              name: 'Triphala Churna',
              dosage: '3 grams',
              frequency: 'Bedtime with warm water',
              duration: '14 days',
            },
            {
              name: 'Brahmi Vati',
              dosage: '1 tablet (250mg)',
              frequency: 'Twice daily after meals',
              duration: '30 days',
            },
          ],
          instructions: 'Avoid cold beverages and spicy foods.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diagnosis).toMatch(/Vata-Pitta/);
      prescription = res.body.data;
    });

    it('GET /api/v1/consultations/:id should reflect COMPLETED status', async () => {
      const res = await request
        .get(`/api/v1/consultations/${consultation.id}`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.endedAt).toBeDefined();
    });
  });

  describe('3. Clinical PDF Prescription Generation', () => {
    it('GET /api/v1/prescriptions/:id/pdf should stream a valid application/pdf document', async () => {
      const res = await request
        .get(`/api/v1/prescriptions/${prescription.id}/pdf`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(/inline; filename="prescription-/);
      expect(res.body).toBeDefined();
    });
  });

  describe('4. Payment Webhooks & Verification', () => {
    it('POST /api/v1/payments/webhook should process callback and update payment status', async () => {
      const payload = {
        event: 'payment.captured',
        consultationId: consultation.id,
        transactionRef: `GATEWAY-${Date.now()}-SUCCESS`,
        amount: 850.0,
        status: 'COMPLETED',
      };
      const signature = crypto
        .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');

      const res = await request
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'PAYMENT_WEBHOOK_PROCESSED',
          entityId: res.body.data.id,
        },
      });
      expect(audit).toBeDefined();
    });
  });

  describe('5. Availability Management (Doctor Slot Deletion)', () => {
    it('Doctor can delete an unbooked availability slot (slotB)', async () => {
      const res = await request
        .delete(`/api/v1/availability/${slotB.id}`)
        .set(getAuthHeader(doctorUser));

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted successfully/i);

      // Verify slot no longer exists
      const deleted = await prisma.availabilitySlot.findUnique({
        where: { id: slotB.id },
      });
      expect(deleted).toBeNull();
    });

    it('Doctor attempting to delete a BOOKED slot should receive 409 Conflict', async () => {
      const res = await request
        .delete(`/api/v1/availability/${slotA.id}`)
        .set(getAuthHeader(doctorUser));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already been booked/i);
    });
  });
});
