import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';

describe('Concurrency-Sensitive Booking, Idempotency & Audit Trails', () => {
  let doctorUser;
  let doctorProfile;
  let patientA;
  let patientB;
  let slotForConcurrentTest;
  let slotForIdempotencyTest;

  beforeAll(async () => {
    // 1. Create a Doctor
    doctorUser = await prisma.user.create({
      data: {
        email: `concurrency.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: {
          create: { firstName: 'Concurrent', lastName: 'Doc' },
        },
        doctorProfile: {
          create: {
            licenseNumber: `CONC-DOC-${Date.now()}`,
            specialization: 'Ayurveda Concurrency',
            consultationFee: 500.0,
            qualification: 'MD Ayurveda',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    doctorProfile = doctorUser.doctorProfile;

    // 2. Create Patient A & Patient B
    patientA = await prisma.user.create({
      data: {
        email: `patient.a.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Patient', lastName: 'A' } },
      },
    });

    patientB = await prisma.user.create({
      data: {
        email: `patient.b.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Patient', lastName: 'B' } },
      },
    });

    // 3. Create Slots
    const baseTime = Date.now() + 1000000;
    slotForConcurrentTest = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime: new Date(baseTime),
        endTime: new Date(baseTime + 1800000),
        status: 'AVAILABLE',
      },
    });

    slotForIdempotencyTest = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime: new Date(baseTime + 3600000),
        endTime: new Date(baseTime + 5400000),
        status: 'AVAILABLE',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data safely
    await prisma.consultation.deleteMany({
      where: { doctorId: doctorProfile.id },
    });
    await prisma.availabilitySlot.deleteMany({
      where: { doctorId: doctorProfile.id },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [patientA.id, patientB.id, doctorUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [patientA.id, patientB.id, doctorUser.id] } },
    });
  });

  it('Concurrent Booking: Two simultaneous requests for the same slot must allow only 1 booking', async () => {
    // Execute both requests concurrently via Promise.all
    const [response1, response2] = await Promise.all([
      request
        .post('/api/v1/consultations/book')
        .set(getAuthHeader(patientA))
        .send({ slotId: slotForConcurrentTest.id, notes: 'Patient A booking' }),
      request
        .post('/api/v1/consultations/book')
        .set(getAuthHeader(patientB))
        .send({ slotId: slotForConcurrentTest.id, notes: 'Patient B booking' }),
    ]);

    const statuses = [response1.status, response2.status].sort();

    // Exactly one must be 201 Created and the other must be 409 Conflict
    expect(statuses).toEqual([201, 409]);

    // Verify database state: exactly 1 consultation linked to the slot
    const consultationsInDb = await prisma.consultation.findMany({
      where: { slotId: slotForConcurrentTest.id },
    });
    expect(consultationsInDb).toHaveLength(1);

    // Verify slot status in database is BOOKED
    const updatedSlot = await prisma.availabilitySlot.findUnique({
      where: { id: slotForConcurrentTest.id },
    });
    expect(updatedSlot.status).toBe('BOOKED');
  });

  it('Idempotency: Re-submitting the same idempotency key returns the existing consultation', async () => {
    const idempotencyKey = `idemp-test-${crypto.randomUUID()}`;

    // First request
    const firstRes = await request
      .post('/api/v1/consultations/book')
      .set(getAuthHeader(patientA))
      .send({
        slotId: slotForIdempotencyTest.id,
        notes: 'Initial attempt',
        idempotencyKey,
      });

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.data.idempotencyKey).toBe(idempotencyKey);
    const consultationId = firstRes.body.data.id;

    // Retry with identical idempotencyKey
    const retryRes = await request
      .post('/api/v1/consultations/book')
      .set(getAuthHeader(patientA))
      .send({
        slotId: slotForIdempotencyTest.id,
        notes: 'Network retry with same key',
        idempotencyKey,
      });

    // Should return existing record (not create a duplicate)
    expect(retryRes.status).toBe(201);
    expect(retryRes.body.data.id).toBe(consultationId);

    // Verify only 1 consultation was created
    const totalConsultations = await prisma.consultation.count({
      where: { idempotencyKey },
    });
    expect(totalConsultations).toBe(1);
  });

  it('Audit Trail: Consultation booking creates an immutable AuditLog entry', async () => {
    const auditEntries = await prisma.auditLog.findMany({
      where: {
        userId: patientA.id,
        action: 'BOOK_CONSULTATION',
      },
    });

    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0].entityType).toBe('Consultation');
    expect(auditEntries[0].metadata).toHaveProperty('consultationNumber');
  });

  it('Schema Integrity: partial unique index consultations_active_slotId_key exists in PostgreSQL pg_indexes', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'consultations'
        AND indexname = 'consultations_active_slotId_key'
    `;

    expect(indexes.length).toBe(1);
    expect(indexes[0].indexname).toBe('consultations_active_slotId_key');
    expect(indexes[0].indexdef).toContain('CREATE UNIQUE INDEX');
    expect(indexes[0].indexdef).toContain('slotId');
    expect(indexes[0].indexdef).toContain('CANCELLED');
  });
});
