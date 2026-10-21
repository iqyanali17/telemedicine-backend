import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';

describe('Object-Level Authorization (BOLA/IDOR) Verification', () => {
  let docAUser, docBUser;
  let docAProfile;
  let patientA, patientB;
  let slotA;
  let consultationA;

  beforeAll(async () => {
    // 1. Doctors
    docAUser = await prisma.user.create({
      data: {
        email: `obj.doc.a.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pass',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Doc', lastName: 'Alpha' } },
        doctorProfile: {
          create: {
            licenseNumber: `OBJ-DOC-A-${Date.now()}`,
            specialization: 'Ayurveda',
            consultationFee: 500,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    docAProfile = docAUser.doctorProfile;

    docBUser = await prisma.user.create({
      data: {
        email: `obj.doc.b.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pass',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Doc', lastName: 'Beta' } },
        doctorProfile: {
          create: {
            licenseNumber: `OBJ-DOC-B-${Date.now()}`,
            specialization: 'Ayurveda',
            consultationFee: 600,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });

    // 2. Patients
    patientA = await prisma.user.create({
      data: {
        email: `obj.pat.a.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pass',
        role: 'PATIENT',
        profile: { create: { firstName: 'Patient', lastName: 'Alpha' } },
      },
    });

    patientB = await prisma.user.create({
      data: {
        email: `obj.pat.b.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pass',
        role: 'PATIENT',
        profile: { create: { firstName: 'Patient', lastName: 'Beta' } },
      },
    });

    // 3. Slots & Consultations
    const t = Date.now() + 2000000;
    slotA = await prisma.availabilitySlot.create({
      data: {
        doctorId: docAProfile.id,
        startTime: new Date(t),
        endTime: new Date(t + 1800000),
        status: 'BOOKED',
      },
    });

    consultationA = await prisma.consultation.create({
      data: {
        consultationNumber: `AMR-OBJ-A-${Date.now()}`,
        patientId: patientA.id,
        doctorId: docAProfile.id,
        slotId: slotA.id,
        scheduledAt: slotA.startTime,
        status: 'SCHEDULED',
      },
    });

    // 4. Prescription for Consultation A by Doc A
    await prisma.prescription.create({
      data: {
        consultationId: consultationA.id,
        doctorId: docAProfile.id,
        patientId: patientA.id,
        diagnosis: 'Stress and Vata imbalance',
        medicines: [{ name: 'Ashwagandha', dosage: '500mg', frequency: 'twice daily', duration: '14 days' }],
      },
    });
  });

  afterAll(async () => {
    await prisma.prescription.deleteMany({
      where: { consultationId: consultationA.id },
    });
    await prisma.payment.deleteMany({
      where: { consultationId: consultationA.id },
    });
    await prisma.consultation.deleteMany({
      where: { id: consultationA.id },
    });
    await prisma.availabilitySlot.deleteMany({
      where: { id: slotA.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [docAUser.id, docBUser.id, patientA.id, patientB.id] } },
    });
  });

  it('Patient B should NOT be able to access Patient A prescription', async () => {
    const res = await request
      .get(`/api/v1/prescriptions/consultation/${consultationA.id}`)
      .set(getAuthHeader(patientB));

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Doctor B (unassigned) should NOT be able to access Consultation A prescription', async () => {
    const res = await request
      .get(`/api/v1/prescriptions/consultation/${consultationA.id}`)
      .set(getAuthHeader(docBUser));

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Patient B should NOT be able to initiate payment for Patient A consultation', async () => {
    const res = await request
      .post('/api/v1/payments/initiate')
      .set(getAuthHeader(patientB))
      .send({
        consultationId: consultationA.id,
        paymentMethod: 'UPI',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
