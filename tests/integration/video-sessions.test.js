import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';

describe('Phase 3.2 — Video Consultation Sessions & Orchestration', () => {
  let docUser, docProfile;
  let unassignedDocUser, unassignedDocProfile;
  let patientUser, unassignedPatient;
  let slotActive, slotFarFuture;
  let activeConsultation, farFutureConsultation;
  let cancelledConsultation;

  beforeAll(async () => {
    // 1. Assigned Doctor
    docUser = await prisma.user.create({
      data: {
        email: `video.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Vasant', lastName: 'Lad' } },
        doctorProfile: {
          create: {
            licenseNumber: `VID-DOC-${Date.now()}`,
            specialization: 'Ayurvedic Telemedicine',
            consultationFee: 1000.0,
            qualification: 'BAMS, MD',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    docProfile = docUser.doctorProfile;

    // 2. Unassigned Doctor
    unassignedDocUser = await prisma.user.create({
      data: {
        email: `unassigned.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Intruder', lastName: 'Doc' } },
        doctorProfile: {
          create: {
            licenseNumber: `VID-INTRUDER-${Date.now()}`,
            specialization: 'General',
            consultationFee: 500.0,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    unassignedDocProfile = unassignedDocUser.doctorProfile;

    // 3. Assigned Patient
    patientUser = await prisma.user.create({
      data: {
        email: `video.pat.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Ananya', lastName: 'Deshmukh' } },
      },
    });

    // 4. Unassigned Patient
    unassignedPatient = await prisma.user.create({
      data: {
        email: `unassigned.pat.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Eavesdropper', lastName: 'Patient' } },
      },
    });

    // 5. Active Slot (now within scheduled window)
    const now = Date.now();
    slotActive = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now - 5 * 60 * 1000), // Started 5 mins ago
        endTime: new Date(now + 25 * 60 * 1000), // Ends in 25 mins
        status: 'BOOKED',
      },
    });

    activeConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `VID-ACT-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotActive.id,
        scheduledAt: slotActive.startTime,
        status: 'SCHEDULED',
      },
    });

    // 6. Far Future Slot (e.g. tomorrow, outside 15-min grace window)
    slotFarFuture = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now + 24 * 3600 * 1000), // 24 hours in future
        endTime: new Date(now + 24 * 3600 * 1000 + 1800000),
        status: 'BOOKED',
      },
    });

    farFutureConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `VID-FUT-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotFarFuture.id,
        scheduledAt: slotFarFuture.startTime,
        status: 'SCHEDULED',
      },
    });

    // 7. Cancelled Consultation
    const slotCancelled = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now - 10 * 60 * 1000),
        endTime: new Date(now + 20 * 60 * 1000),
        status: 'AVAILABLE',
      },
    });

    cancelledConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `VID-CANC-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotCancelled.id,
        scheduledAt: slotCancelled.startTime,
        status: 'CANCELLED',
        cancellationReason: 'Patient cancelled',
      },
    });
  });

  afterAll(async () => {
    await prisma.videoSession.deleteMany({
      where: { consultationId: { in: [activeConsultation.id, farFutureConsultation.id, cancelledConsultation.id] } },
    });
    await prisma.consultation.deleteMany({
      where: { doctorId: { in: [docProfile.id, unassignedDocProfile.id] } },
    });
    await prisma.availabilitySlot.deleteMany({
      where: { doctorId: { in: [docProfile.id, unassignedDocProfile.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [docUser.id, unassignedDocUser.id, patientUser.id, unassignedPatient.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [docUser.id, unassignedDocUser.id, patientUser.id, unassignedPatient.id] } },
    });
  });

  describe('1. Security & Object-Level Authorization (IDOR / BOLA Prevention)', () => {
    it('Unassigned patient attempting to join receives 403 Forbidden', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/join`)
        .set(getAuthHeader(unassignedPatient));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized/i);
    });

    it('Unassigned doctor attempting to join receives 403 Forbidden', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/join`)
        .set(getAuthHeader(unassignedDocUser));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/only the assigned doctor/i);
    });

    it('Unauthenticated caller attempting to join receives 401 Unauthorized', async () => {
      const res = await request.post(`/api/v1/consultations/${activeConsultation.id}/video/join`);
      expect(res.status).toBe(401);
    });
  });

  describe('2. Consultation Status & Time Window Guards', () => {
    it('Attempting to join a CANCELLED consultation receives 409 Conflict', async () => {
      const res = await request
        .post(`/api/v1/consultations/${cancelledConsultation.id}/video/join`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/cancelled consultation/i);
    });

    it('Attempting to join far in advance of scheduled window receives 409 Conflict', async () => {
      const res = await request
        .post(`/api/v1/consultations/${farFutureConsultation.id}/video/join`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not open yet/i);
    });
  });

  describe('3. Active Session Orchestration & Token Generation', () => {
    let patientToken;

    it('Assigned patient joins within active window: receives room details & participant JWT', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/join`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('session');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.session.roomId).toBeDefined();
      expect(res.body.data.permissions.isModerator).toBe(false);

      patientToken = res.body.data.accessToken;

      // Verify cryptographic token claims
      const decoded = jwt.verify(patientToken, env.VIDEO_JWT_SECRET);
      expect(decoded.sub).toBe(patientUser.id);
      expect(decoded.role).toBe('PATIENT');
      expect(decoded.roomId).toBe(res.body.data.session.roomId);
    });

    it('Assigned doctor joins: session transitions to ACTIVE and consultation to IN_PROGRESS', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/join`)
        .set(getAuthHeader(docUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.permissions.isModerator).toBe(true);
      expect(res.body.data.permissions.canScreenShare).toBe(true);
      expect(res.body.data.session.status).toBe('ACTIVE');

      // Verify consultation updated in database
      const consultationDb = await prisma.consultation.findUnique({
        where: { id: activeConsultation.id },
      });
      expect(consultationDb.status).toBe('IN_PROGRESS');
      expect(consultationDb.startedAt).toBeDefined();

      // Verify audit log recorded
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'VIDEO_SESSION_JOINED',
          userId: docUser.id,
        },
      });
      expect(audit).toBeDefined();
    });

    it('Participant leaves session: logs disconnect audit event', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/leave`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'VIDEO_SESSION_LEFT',
          userId: patientUser.id,
        },
      });
      expect(audit).toBeDefined();
    });

    it('Patient attempting to terminate/end room receives 403 Forbidden', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/end`)
        .set(getAuthHeader(patientUser))
        .send({ reason: 'Patient trying to end call' });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/only the assigned doctor/i);
    });

    it('Doctor ends session: session marks COMPLETED and records duration', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/video/end`)
        .set(getAuthHeader(docUser))
        .send({ reason: 'Consultation successfully concluded' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.endedAt).toBeDefined();
      expect(res.body.data.durationSeconds).toBeGreaterThanOrEqual(0);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'VIDEO_SESSION_ENDED',
          userId: docUser.id,
        },
      });
      expect(audit).toBeDefined();
    });

    it('GET /api/v1/consultations/:id/video returns completed video session summary', async () => {
      const res = await request
        .get(`/api/v1/consultations/${activeConsultation.id}/video`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.roomId).toBeDefined();
    });
  });
});
