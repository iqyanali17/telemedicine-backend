import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';

describe('Request Validation Boundaries & Malformed Inputs', () => {
  let createdDoctorUser;
  let doctorUser = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'doctor@amrutam.test',
    role: 'DOCTOR',
  };

  const patientUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'patient@amrutam.test',
    role: 'PATIENT',
  };

  beforeAll(async () => {
    createdDoctorUser = await prisma.user.create({
      data: {
        email: `val.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'dummy_hash',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Vaidya', lastName: 'Kumar' } },
        doctorProfile: {
          create: {
            licenseNumber: `VAL-LIC-${Date.now()}`,
            specialization: 'Ayurveda',
            consultationFee: 500,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
    });
    doctorUser = {
      id: createdDoctorUser.id,
      email: createdDoctorUser.email,
      role: createdDoctorUser.role,
    };
  });

  afterAll(async () => {
    if (createdDoctorUser) {
      await prisma.doctorProfile.deleteMany({ where: { userId: createdDoctorUser.id } });
      await prisma.profile.deleteMany({ where: { userId: createdDoctorUser.id } });
      await prisma.user.deleteMany({ where: { id: createdDoctorUser.id } });
    }
  });

  describe('Auth Validation', () => {
    it('Registration should reject password without uppercase character', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'valid.email@test.com',
        password: 'password123!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/uppercase/i);
    });

    it('Registration should reject password without numbers', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'valid.email@test.com',
        password: 'PasswordNoNumber!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/number/i);
    });

    it('Registration should reject missing name fields', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'valid.email@test.com',
        password: 'Password123!',
        firstName: '',
        lastName: '  ',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('Registration should reject name containing numbers (e.g. iqyan2 or ali2)', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'test.name.num@test.com',
        password: 'Password123!',
        firstName: 'iqyan2',
        lastName: 'ali2',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/cannot contain numbers/i);
    });

    it('Registration should reject mobile number that is not 10 digits (e.g. 98993)', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'test.phone.short@test.com',
        password: 'Password123!',
        firstName: 'Iqyan',
        lastName: 'Ali',
        phone: '98993',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/10-digit/i);
    });

    it('Registration should reject password without special symbol (e.g. Iqyan123)', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'test.symbol.missing@test.com',
        password: 'Iqyan123',
        firstName: 'Iqyan',
        lastName: 'Ali',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/symbol/i);
    });

    it('Registration should reject email without @ character', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'invalidemailformat.com',
        password: 'Password123!',
        firstName: 'Iqyan',
        lastName: 'Ali',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/@/);
    });
  });

  describe('Availability Validation', () => {
    it('Query slots with invalid date format should return 422', async () => {
      const res = await request.get('/api/v1/availability?date=26-10-2026');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/YYYY-MM-DD/i);
    });

    it('Create slots with endTime earlier than startTime should return 422', async () => {
      const startTime = '2026-11-01T10:00:00.000Z';
      const invalidEndTime = '2026-11-01T09:00:00.000Z'; // 1 hour earlier

      const res = await request
        .post('/api/v1/availability')
        .set(getAuthHeader(doctorUser))
        .send({
          slots: [{ startTime, endTime: invalidEndTime }],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/strictly after startTime/i);
    });

    it('Create slots with startTime in the past should return 422', async () => {
      const pastStartTime = '2020-01-01T10:00:00.000Z';
      const pastEndTime = '2020-01-01T11:00:00.000Z';

      const res = await request
        .post('/api/v1/availability')
        .set(getAuthHeader(doctorUser))
        .send({
          slots: [{ startTime: pastStartTime, endTime: pastEndTime }],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/cannot be in the past/i);
    });

    it('Create slots exceeding maximum 100 batch limit should return 422', async () => {
      const now = Date.now() + 86400000;
      const oversizedBatch = Array.from({ length: 101 }, (_, i) => ({
        startTime: new Date(now + i * 3600000).toISOString(),
        endTime: new Date(now + (i + 1) * 3600000).toISOString(),
      }));

      const res = await request
        .post('/api/v1/availability')
        .set(getAuthHeader(doctorUser))
        .send({ slots: oversizedBatch });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/cannot create more than 100 slots/i);
    });
  });

  describe('Consultation Validation', () => {
    it('Booking with malformed non-UUID slotId should return 422', async () => {
      const res = await request
        .post('/api/v1/consultations/book')
        .set(getAuthHeader(patientUser))
        .send({
          slotId: 'not-a-valid-uuid-string',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/uuid/i);
    });
  });

  describe('Path Parameter UUID Validation', () => {
    it('GET /api/v1/doctors/:id with invalid UUID should return 422', async () => {
      const res = await request.get('/api/v1/doctors/not-a-valid-uuid');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/valid UUID/i);
    });

    it('GET /api/v1/prescriptions/consultation/:id with invalid UUID should return 422', async () => {
      const res = await request
        .get('/api/v1/prescriptions/consultation/123-not-uuid')
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/valid UUID/i);
    });

    it('GET /api/v1/payments/:id with invalid UUID should return 422', async () => {
      const res = await request
        .get('/api/v1/payments/invalid-id')
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/valid UUID/i);
    });
  });

  describe('Prescription Validation Boundaries', () => {
    it('POST /api/v1/prescriptions with past validUntil date should return 422', async () => {
      const res = await request
        .post('/api/v1/prescriptions')
        .set(getAuthHeader(doctorUser))
        .send({
          consultationId: '00000000-0000-0000-0000-000000000001',
          diagnosis: 'Chronic joint pain',
          medicines: [{
            name: 'Shallaki',
            dosage: '500mg',
            frequency: 'twice daily',
            duration: '14 days',
          }],
          validUntil: '1999-01-01T00:00:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/validUntil date must be in the future/i);
    });
  });

  describe('User Profile Validation Boundaries', () => {
    it('PATCH /api/v1/users/profile with invalid bloodGroup should return 422', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set(getAuthHeader(patientUser))
        .send({ bloodGroup: 'Z_POSITIVE' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/bloodGroup|expected one of/i);
    });

    it('PATCH /api/v1/users/profile with malformed phone should return 422', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set(getAuthHeader(patientUser))
        .send({ phone: 'not-a-phone' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/invalid phone number/i);
    });
  });

  describe('Doctor Profile Management Workflow', () => {
    it('PATCH /api/v1/doctors/profile allows verified doctor to update fee and bio', async () => {
      const res = await request
        .patch('/api/v1/doctors/profile')
        .set(getAuthHeader(doctorUser))
        .send({
          consultationFee: 750,
          bio: 'Senior Ayurvedic Physician with 12 years of clinical experience.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.consultationFee)).toBe(750);
      expect(res.body.data.bio).toMatch(/Senior Ayurvedic Physician/);
    });

    it('PATCH /api/v1/doctors/profile rejects unauthorized patient attempt with 403', async () => {
      const res = await request
        .patch('/api/v1/doctors/profile')
        .set(getAuthHeader(patientUser))
        .send({ consultationFee: 1000 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
