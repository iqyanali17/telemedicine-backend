import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';

describe('Phase 3.3 — Secure Clinical Messaging & Medical Attachments', () => {
  let docUser, docProfile;
  let unassignedDocUser;
  let patientUser, unassignedPatient;
  let activeConsultation, cancelledConsultation;
  let uploadedAttachmentId;

  // Valid PDF header "%PDF-1.4 sample content" in base64
  const validPdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

  // Valid PNG header (89 50 4E 47 0D 0A 1A 0A) in base64
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  const validPngBase64 = validPngBuffer.toString('base64');

  // Spoofed PDF (starts with HTML instead of %PDF)
  const fakePdfBase64 = Buffer.from('<html><script>alert("malicious")</script></html>').toString('base64');

  beforeAll(async () => {
    // 1. Assigned Doctor
    docUser = await prisma.user.create({
      data: {
        email: `msg.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Charaka', lastName: 'Ayurveda' } },
        doctorProfile: {
          create: {
            licenseNumber: `MSG-DOC-${Date.now()}`,
            specialization: 'Kayachikitsa',
            consultationFee: 750.0,
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
        email: `unassigned.msg.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Other', lastName: 'Doc' } },
        doctorProfile: {
          create: {
            licenseNumber: `MSG-OTHER-${Date.now()}`,
            specialization: 'General',
            consultationFee: 500.0,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });

    // 3. Assigned Patient
    patientUser = await prisma.user.create({
      data: {
        email: `msg.patient.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Rohan', lastName: 'Mehta' } },
      },
    });

    // 4. Unassigned Patient
    unassignedPatient = await prisma.user.create({
      data: {
        email: `unassigned.msg.pat.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Intruder', lastName: 'Patient' } },
      },
    });

    // 5. Active Consultation
    const now = new Date();
    const activeSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now.getTime() - 10 * 60 * 1000),
        endTime: new Date(now.getTime() + 30 * 60 * 1000),
        status: 'BOOKED',
      },
    });

    activeConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `MSG-ACT-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: activeSlot.id,
        scheduledAt: activeSlot.startTime,
        status: 'IN_PROGRESS',
      },
    });

    // 6. Cancelled Consultation
    const cancelledSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now.getTime() + 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 90 * 60 * 1000),
        status: 'BOOKED',
      },
    });

    cancelledConsultation = await prisma.consultation.create({
      data: {
        consultationNumber: `MSG-CNC-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: cancelledSlot.id,
        scheduledAt: cancelledSlot.startTime,
        status: 'CANCELLED',
      },
    });
  });

  afterAll(async () => {
    // Cleanup created records
    try {
      await prisma.medicalAttachment.deleteMany({
        where: { consultationId: { in: [activeConsultation?.id, cancelledConsultation?.id].filter(Boolean) } },
      });
      await prisma.consultationMessage.deleteMany({
        where: { consultationId: { in: [activeConsultation?.id, cancelledConsultation?.id].filter(Boolean) } },
      });
      await prisma.consultation.deleteMany({
        where: { id: { in: [activeConsultation?.id, cancelledConsultation?.id].filter(Boolean) } },
      });
      await prisma.availabilitySlot.deleteMany({
        where: { doctorId: { in: [docProfile?.id, unassignedDocUser?.doctorProfile?.id].filter(Boolean) } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [docUser?.id, patientUser?.id, unassignedDocUser?.id, unassignedPatient?.id].filter(Boolean) } },
      });
      await prisma.doctorProfile.deleteMany({
        where: { userId: { in: [docUser?.id, unassignedDocUser?.id].filter(Boolean) } },
      });
      await prisma.userProfile.deleteMany({
        where: { userId: { in: [docUser?.id, patientUser?.id, unassignedDocUser?.id, unassignedPatient?.id].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [docUser?.id, patientUser?.id, unassignedDocUser?.id, unassignedPatient?.id].filter(Boolean) } },
      });
    } catch {
      // Ignored
    }
  });

  describe('1. Clinical Messaging Access Control', () => {
    it('rejects unauthenticated requests to send messages', async () => {
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/messages`)
        .send({ content: 'Hello doctor' });

      expect(res.status).toBe(401);
    });

    it('rejects unassigned doctor from sending messages (403)', async () => {
      const authHeader = getAuthHeader(unassignedDocUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/messages`)
        .set(authHeader)
        .send({ content: 'I am not your doctor' });

      expect(res.status).toBe(403);
    });

    it('rejects unassigned patient from sending messages (403)', async () => {
      const authHeader = getAuthHeader(unassignedPatient);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/messages`)
        .set(authHeader)
        .send({ content: 'Intruder message' });

      expect(res.status).toBe(403);
    });

    it('rejects sending messages for a cancelled consultation (409)', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .post(`/api/v1/consultations/${cancelledConsultation.id}/messages`)
        .set(authHeader)
        .send({ content: 'Trying to chat on cancelled session' });

      expect(res.status).toBe(409);
    });
  });

  describe('2. Message Exchange & Read Receipts', () => {
    let doctorMessageId;

    it('allows doctor to send clinical message to patient', async () => {
      const authHeader = getAuthHeader(docUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/messages`)
        .set(authHeader)
        .send({ content: 'Please share your recent fasting blood glucose readings.' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('Please share your recent fasting blood glucose readings.');
      expect(res.body.data.senderRole).toBe('DOCTOR');
      expect(res.body.data.messageType).toBe('TEXT');
      expect(res.body.data.isRead).toBe(false);

      doctorMessageId = res.body.data.id;

      // Verify AuditLog does NOT contain the raw clinical text
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: doctorMessageId, action: 'CLINICAL_MESSAGE_SENT' },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit.metadata)).not.toContain('glucose');
      expect(audit.metadata.contentLength).toBe('Please share your recent fasting blood glucose readings.'.length);
    });

    it('allows patient to send response message to doctor', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/messages`)
        .set(authHeader)
        .send({ content: 'Sure doctor, my fasting level was 105 mg/dL this morning.' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.senderRole).toBe('PATIENT');
      expect(res.body.data.content).toBe('Sure doctor, my fasting level was 105 mg/dL this morning.');
    });

    it('marks counterparty unread messages as read when patient fetches messages', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .get(`/api/v1/consultations/${activeConsultation.id}/messages?page=1&limit=20`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();

      // Check database to verify doctor's message was marked read
      const updatedDoctorMessage = await prisma.consultationMessage.findUnique({
        where: { id: doctorMessageId },
      });
      expect(updatedDoctorMessage.isRead).toBe(true);
      expect(updatedDoctorMessage.readAt).not.toBeNull();
    });
  });

  describe('3. Medical Attachments — Upload, Validation & Magic Bytes', () => {
    it('rejects uploads with mismatched magic bytes (HTML spoofed as PDF)', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/attachments`)
        .set(authHeader)
        .send({
          fileName: 'fake_report.pdf',
          mimeType: 'application/pdf',
          fileData: fakePdfBase64,
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/signature|mismatch/i);
    });

    it('rejects uploads with unsupported MIME types', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/attachments`)
        .set(authHeader)
        .send({
          fileName: 'executable.exe',
          mimeType: 'application/octet-stream',
          fileData: validPdfBase64,
        });

      expect(res.status).toBe(422);
    });

    it('rejects unassigned doctor from uploading attachment (403)', async () => {
      const authHeader = getAuthHeader(unassignedDocUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/attachments`)
        .set(authHeader)
        .send({
          fileName: 'lab_report.pdf',
          mimeType: 'application/pdf',
          fileData: validPdfBase64,
        });

      expect(res.status).toBe(403);
    });

    it('successfully uploads valid PDF medical attachment with sanitized path', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/attachments`)
        .set(authHeader)
        .send({
          fileName: '../../malicious/path/blood_work_report.pdf',
          mimeType: 'application/pdf',
          fileData: validPdfBase64,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.mimeType).toBe('application/pdf');
      // Verify path traversal was stripped
      expect(res.body.data.fileName).toBe('blood_work_report.pdf');
      expect(res.body.data.storageProvider).toBe('LOCAL_SECURE');

      uploadedAttachmentId = res.body.data.id;

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: uploadedAttachmentId, action: 'MEDICAL_ATTACHMENT_UPLOADED' },
      });
      expect(audit).not.toBeNull();
      expect(audit.metadata.fileName).toBe('blood_work_report.pdf');
    });

    it('successfully uploads valid PNG image attachment', async () => {
      const authHeader = getAuthHeader(docUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/attachments`)
        .set(authHeader)
        .send({
          fileName: 'rash_photograph.png',
          mimeType: 'image/png',
          fileData: validPngBase64,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mimeType).toBe('image/png');
      expect(res.body.data.fileName).toBe('rash_photograph.png');
    });
  });

  describe('4. Message with Attachment Link & Attachment Operations', () => {
    it('sends message referencing the uploaded attachment', async () => {
      const authHeader = getAuthHeader(patientUser);
      const res = await request
        .post(`/api/v1/consultations/${activeConsultation.id}/messages`)
        .set(authHeader)
        .send({
          content: 'Here is my complete blood count report.',
          attachmentId: uploadedAttachmentId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messageType).toBe('ATTACHMENT');
      expect(res.body.data.attachments).toBeDefined();
      expect(res.body.data.attachments.length).toBe(1);
      expect(res.body.data.attachments[0].id).toBe(uploadedAttachmentId);
    });

    it('lists all attachments for the consultation', async () => {
      const authHeader = getAuthHeader(docUser);
      const res = await request
        .get(`/api/v1/consultations/${activeConsultation.id}/attachments`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      const found = res.body.data.find((a) => a.id === uploadedAttachmentId);
      expect(found).toBeDefined();
      expect(found.fileName).toBe('blood_work_report.pdf');
    });

    it('streams and downloads the private attachment with correct headers', async () => {
      const authHeader = getAuthHeader(docUser);
      const res = await request
        .get(`/api/v1/consultations/${activeConsultation.id}/attachments/${uploadedAttachmentId}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="blood_work_report.pdf"');
      const content = Buffer.isBuffer(res.body) ? res.body.toString() : (res.text || '');
      expect(content).toContain('%PDF-1.4');
    });

    it('denies unassigned user from downloading attachment (403)', async () => {
      const authHeader = getAuthHeader(unassignedPatient);
      const res = await request
        .get(`/api/v1/consultations/${activeConsultation.id}/attachments/${uploadedAttachmentId}`)
        .set(authHeader);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent attachment download', async () => {
      const authHeader = getAuthHeader(docUser);
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .get(`/api/v1/consultations/${activeConsultation.id}/attachments/${fakeId}`)
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });
});
