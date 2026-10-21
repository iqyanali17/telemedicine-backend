import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';

describe('Doctor Onboarding Application & Administrative Verification Workflow', () => {
  let adminUser;
  let patientUser;
  let _registeredDoctorId;
  let registeredDoctorProfileId;
  const testTimestamp = Date.now();
  const validDoctorData = {
    email: `apply.doc.${testTimestamp}@amrutam.test`,
    password: 'DoctorPassword123!',
    firstName: 'Devavrat',
    lastName: 'Sharma',
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    licenseNumber: `AYUR-LIC-${testTimestamp}`,
    specialization: 'Ayurvedic Kayachikitsa',
    experienceYears: 9,
    consultationFee: 750,
    qualification: 'BAMS, MD (Kayachikitsa)',
    bio: 'Dedicated Ayurvedic physician with special interest in gut microbiome and autoimmune wellness.',
  };

  beforeAll(async () => {
    // 1. Ensure test admin user
    adminUser = await prisma.user.create({
      data: {
        email: `admin.onboard.${testTimestamp}@amrutam.test`,
        passwordHash: 'hash',
        role: 'ADMIN',
        profile: {
          create: { firstName: 'Compliance', lastName: 'Admin' },
        },
      },
    });

    // 2. Ensure test patient user
    patientUser = await prisma.user.create({
      data: {
        email: `patient.onboard.${testTimestamp}@amrutam.test`,
        passwordHash: 'hash',
        role: 'PATIENT',
        profile: {
          create: { firstName: 'Test', lastName: 'Patient' },
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up created test accounts
    await prisma.auditLog.deleteMany({
      where: { userId: adminUser?.id },
    });
    if (registeredDoctorProfileId) {
      await prisma.doctorProfile.deleteMany({
        where: { id: registeredDoctorProfileId },
      });
    }
    await prisma.profile.deleteMany({
      where: {
        user: {
          email: {
            in: [
              validDoctorData.email,
              adminUser?.email,
              patientUser?.email,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            validDoctorData.email,
            adminUser?.email,
            patientUser?.email,
          ],
        },
      },
    });
  });

  describe('1. Doctor Registration & Field Validation (POST /api/v1/auth/doctor/register)', () => {
    it('rejects registration when first name contains numbers', async () => {
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send({
          ...validDoctorData,
          email: `doc.fail.${Date.now()}@amrutam.test`,
          firstName: 'Ananya123',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('First name must contain only letters');
    });

    it('rejects registration with invalid 6-digit mobile phone number', async () => {
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send({
          ...validDoctorData,
          email: `doc.fail.${Date.now()}@amrutam.test`,
          phone: '98993',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('Mobile number must be a valid 10-digit phone number');
    });

    it('rejects registration with weak password lacking uppercase or special character', async () => {
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send({
          ...validDoctorData,
          email: `doc.fail.${Date.now()}@amrutam.test`,
          password: 'password123',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('Password must contain at least one uppercase letter');
    });

    it('rejects registration when medical license number is omitted', async () => {
      const { licenseNumber: _, ...missingLicense } = validDoctorData;
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send({
          ...missingLicense,
          email: `doc.fail.${Date.now()}@amrutam.test`,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors.some((e) => e.path === 'licenseNumber')).toBe(true);
    });

    it('successfully registers doctor application and defaults isVerified to false', async () => {
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send(validDoctorData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('DOCTOR');
      expect(res.body.data.user.doctorProfile.isVerified).toBe(false);
      expect(res.body.data.user.doctorProfile.licenseNumber).toBe(validDoctorData.licenseNumber);
      expect(res.body.data.verificationStatus).toBe('PENDING_APPROVAL');

      _registeredDoctorId = res.body.data.user.id;
      registeredDoctorProfileId = res.body.data.user.doctorProfile.id;
    });

    it('rejects duplicate doctor registration with same email address', async () => {
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send({
          ...validDoctorData,
          phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
          licenseNumber: `NEW-LIC-${Date.now()}`,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('An account with this email already exists');
    });

    it('rejects duplicate doctor registration with same license number', async () => {
      const res = await request
        .post('/api/v1/auth/doctor/register')
        .send({
          ...validDoctorData,
          email: `doc.distinct.${Date.now()}@amrutam.test`,
          phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('A doctor with this medical license number already exists');
    });
  });

  describe('2. Patient Discovery Isolation (GET /api/v1/doctors)', () => {
    it('does NOT return unverified doctor in public patient search results', async () => {
      const res = await request.get(`/api/v1/doctors?search=${validDoctorData.lastName}`);
      expect(res.status).toBe(200);

      const items = res.body.data.items || [];
      const found = items.some((d) => d.id === registeredDoctorProfileId);
      expect(found).toBe(false);
    });
  });

  describe('3. Administrative Review & Approval (GET & PATCH /api/v1/admin/doctors)', () => {
    it('denies access to non-admin users attempting to view doctor verifications', async () => {
      const patientAuth = getAuthHeader(patientUser);
      const res = await request
        .get('/api/v1/admin/doctors')
        .set(patientAuth);

      expect(res.status).toBe(403);
    });

    it('allows Admin to list pending unverified doctor applications', async () => {
      const adminAuth = getAuthHeader(adminUser);
      const res = await request
        .get('/api/v1/admin/doctors?isVerified=false')
        .set(adminAuth);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.pending).toBeGreaterThanOrEqual(1);

      const items = res.body.data.items || [];
      const pendingDoctor = items.find((d) => d.id === registeredDoctorProfileId);
      expect(pendingDoctor).toBeDefined();
      expect(pendingDoctor.isVerified).toBe(false);
      expect(pendingDoctor.licenseNumber).toBe(validDoctorData.licenseNumber);
    });

    it('allows Admin to approve and verify the doctor license', async () => {
      const adminAuth = getAuthHeader(adminUser);
      const res = await request
        .patch(`/api/v1/admin/doctors/${registeredDoctorProfileId}/verify`)
        .set(adminAuth)
        .send({ isVerified: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isVerified).toBe(true);
      expect(res.body.data.licenseNumber).toBe(validDoctorData.licenseNumber);

      // Verify audit log entry was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'DOCTOR_VERIFIED',
          entityId: registeredDoctorProfileId,
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.userId).toBe(adminUser.id);
    });

    it('makes verified doctor immediately discoverable in public patient directory', async () => {
      const res = await request.get(`/api/v1/doctors?search=${validDoctorData.lastName}`);
      expect(res.status).toBe(200);

      const items = res.body.data.items || [];
      const foundDoctor = items.find((d) => d.id === registeredDoctorProfileId);
      expect(foundDoctor).toBeDefined();
      expect(foundDoctor.isVerified).toBe(true);
      expect(foundDoctor.specialization).toBe(validDoctorData.specialization);
    });

    it('allows Admin to revoke doctor verification if needed', async () => {
      const adminAuth = getAuthHeader(adminUser);
      const res = await request
        .patch(`/api/v1/admin/doctors/${registeredDoctorProfileId}/verify`)
        .set(adminAuth)
        .send({
          isVerified: false,
          rejectionReason: 'Medical council license expired or invalid document',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isVerified).toBe(false);
      expect(res.body.data.rejectionReason).toContain('license expired');

      // Check public directory again - doctor must disappear
      const publicRes = await request.get(`/api/v1/doctors?search=${validDoctorData.lastName}`);
      const items = publicRes.body.data.items || [];
      expect(items.some((d) => d.id === registeredDoctorProfileId)).toBe(false);
    });
  });
});
