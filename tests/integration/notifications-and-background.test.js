import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';
import { EmailChannel } from '../../src/modules/notifications/channels/email-channel.js';
import { SmsChannel } from '../../src/modules/notifications/channels/sms-channel.js';
import { NotificationDispatcher } from '../../src/modules/notifications/notification.dispatcher.js';

describe('Phase 3.5 — Notifications & Background Processing', () => {
  let adminUser;
  let docUser, docProfile;
  let patientUser, otherPatient;
  let slotFuture, slotReminder;
  let consultationFuture, consultationReminder;
  let notificationId;

  beforeAll(async () => {
    // 1. Admin
    adminUser = await prisma.user.create({
      data: {
        email: `notif.admin.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'ADMIN',
        profile: { create: { firstName: 'System', lastName: 'Administrator' } },
      },
    });

    // 2. Doctor
    docUser = await prisma.user.create({
      data: {
        email: `notif.doc.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'DOCTOR',
        profile: { create: { firstName: 'Sushruta', lastName: 'Vaidya' } },
        doctorProfile: {
          create: {
            licenseNumber: `NOTIF-DOC-${Date.now()}`,
            specialization: 'Ayurveda',
            consultationFee: 800.0,
            qualification: 'BAMS',
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
    docProfile = docUser.doctorProfile;

    // 3. Patient
    patientUser = await prisma.user.create({
      data: {
        email: `notif.pat.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Dev', lastName: 'Patel' } },
      },
    });

    // 4. Other Patient
    otherPatient = await prisma.user.create({
      data: {
        email: `notif.other.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_password',
        role: 'PATIENT',
        profile: { create: { firstName: 'Sneha', lastName: 'Roy' } },
      },
    });

    // 5. Future Slot & Consultation
    const now = new Date();
    slotFuture = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now.getTime() + 48 * 3600 * 1000),
        endTime: new Date(now.getTime() + 48.5 * 3600 * 1000),
        status: 'BOOKED',
      },
    });

    consultationFuture = await prisma.consultation.create({
      data: {
        consultationNumber: `NOTIF-FUT-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotFuture.id,
        scheduledAt: slotFuture.startTime,
        status: 'SCHEDULED',
      },
    });

    // 6. Reminder Slot & Consultation (Starts in 25 mins, within 60 min window)
    slotReminder = await prisma.availabilitySlot.create({
      data: {
        doctorId: docProfile.id,
        startTime: new Date(now.getTime() + 25 * 60 * 1000),
        endTime: new Date(now.getTime() + 55 * 60 * 1000),
        status: 'BOOKED',
      },
    });

    consultationReminder = await prisma.consultation.create({
      data: {
        consultationNumber: `NOTIF-REM-${Date.now()}`,
        patientId: patientUser.id,
        doctorId: docProfile.id,
        slotId: slotReminder.id,
        scheduledAt: slotReminder.startTime,
        status: 'SCHEDULED',
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({
        where: { userId: { in: [adminUser?.id, docUser?.id, patientUser?.id, otherPatient?.id].filter(Boolean) } },
      });
      await prisma.consultation.deleteMany({
        where: { id: { in: [consultationFuture?.id, consultationReminder?.id].filter(Boolean) } },
      });
      await prisma.availabilitySlot.deleteMany({
        where: { id: { in: [slotFuture?.id, slotReminder?.id].filter(Boolean) } },
      });
      await prisma.doctorProfile.deleteMany({
        where: { userId: docUser?.id },
      });
      await prisma.userProfile.deleteMany({
        where: { userId: { in: [adminUser?.id, docUser?.id, patientUser?.id, otherPatient?.id].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [adminUser?.id, docUser?.id, patientUser?.id, otherPatient?.id].filter(Boolean) } },
      });
    } catch {
      // Ignored
    }
  });

  describe('1. Pluggable Channel Providers Unit Contracts', () => {
    it('EmailChannel successfully formats and simulates email dispatch', async () => {
      const emailChannel = new EmailChannel();
      const res = await emailChannel.send({
        recipient: 'patient@example.com',
        subject: 'Appointment Alert',
        content: 'Your appointment is booked.',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^email_/);
      expect(res.recipient).toBe('patient@example.com');
    });

    it('SmsChannel successfully formats and simulates SMS dispatch', async () => {
      const smsChannel = new SmsChannel();
      const res = await smsChannel.send({
        recipient: '+919876543210',
        content: 'Your OTP is 123456.',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^sms_/);
      expect(res.recipient).toBe('+919876543210');
    });
  });

  describe('2. Direct Notification Dispatching', () => {
    it('dispatches in-app notification and persists record in database', async () => {
      await NotificationDispatcher.dispatch({
        userId: patientUser.id,
        type: 'SYSTEM',
        channel: 'IN_APP',
        recipient: patientUser.email,
        subject: 'Welcome to Amrutam',
        content: 'Your account is fully activated.',
      });

      // Wait a moment for setImmediate execution
      await new Promise((r) => setTimeout(r, 200));

      const notification = await prisma.notification.findFirst({
        where: { userId: patientUser.id, subject: 'Welcome to Amrutam' },
      });

      expect(notification).not.toBeNull();
      expect(notification.type).toBe('SYSTEM');
      expect(notification.channel).toBe('IN_APP');
      expect(notification.isRead).toBe(false);

      notificationId = notification.id;
    });
  });

  describe('3. User Notification Endpoints (GET /notifications, PATCH /notifications/:id/read)', () => {
    it('rejects unauthenticated requests to list notifications (401)', async () => {
      const res = await request.get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('returns paginated notifications with unreadCount for authenticated patient', async () => {
      const res = await request
        .get('/api/v1/notifications?page=1&limit=10')
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination).toBeDefined();
    });

    it('prevents another user from marking notification as read (403)', async () => {
      const res = await request
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set(getAuthHeader(otherPatient));

      expect(res.status).toBe(403);
    });

    it('allows patient to mark their own notification as read', async () => {
      const res = await request
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(notificationId);
      expect(res.body.data.isRead).toBe(true);
      expect(res.body.data.readAt).not.toBeNull();
    });

    it('marks all unread notifications as read via mark-all-read endpoint', async () => {
      // Create a second unread notification
      await prisma.notification.create({
        data: {
          userId: patientUser.id,
          type: 'SYSTEM',
          channel: 'IN_APP',
          recipient: patientUser.email,
          content: 'Another notification',
          status: 'SENT',
          isRead: false,
        },
      });

      const res = await request
        .patch('/api/v1/notifications/mark-all-read')
        .set(getAuthHeader(patientUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.markedCount).toBeGreaterThanOrEqual(1);

      // Verify unread count is now 0
      const listRes = await request
        .get('/api/v1/notifications?unreadOnly=true')
        .set(getAuthHeader(patientUser));

      expect(listRes.body.unreadCount).toBe(0);
      expect(listRes.body.data.length).toBe(0);
    });
  });

  describe('4. Scheduled Appointment Reminders (POST /notifications/dispatch-reminders)', () => {
    it('restricts dispatch-reminders from non-admin users (403)', async () => {
      const res = await request
        .post('/api/v1/notifications/dispatch-reminders')
        .set(getAuthHeader(patientUser))
        .send({ windowMinutes: 60 });

      expect(res.status).toBe(403);
    });

    it('allows Admin to execute reminder dispatch for upcoming appointments', async () => {
      const res = await request
        .post('/api/v1/notifications/dispatch-reminders')
        .set(getAuthHeader(adminUser))
        .send({ windowMinutes: 60 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scannedCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.dispatchedCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.consultationIds).toContain(consultationReminder.id);

      // Allow setImmediate to write database record
      await new Promise((r) => setTimeout(r, 200));

      // Verify reminder notification was stored for the patient
      const reminderNotif = await prisma.notification.findFirst({
        where: {
          userId: patientUser.id,
          type: 'UPCOMING_REMINDER',
        },
      });

      expect(reminderNotif).not.toBeNull();
      expect(reminderNotif.subject).toContain('Upcoming Consultation');
    });

    it('does not dispatch duplicate reminders upon immediate re-run', async () => {
      const res = await request
        .post('/api/v1/notifications/dispatch-reminders')
        .set(getAuthHeader(adminUser))
        .send({ windowMinutes: 60 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Because consultationReminder was already reminded, it must not be redispatched
      expect(res.body.data.consultationIds).not.toContain(consultationReminder.id);
    });
  });

  describe('5. Durable PostgreSQL Queue, Retry Policies & Worker Restart Recovery', () => {
    it('persists notification job durably in PENDING state and processes to SENT', async () => {
      const idempotencyKey = `durable-test-${Date.now()}`;
      const notif = await NotificationDispatcher.dispatch({
        userId: patientUser.id,
        type: 'BOOKING_CONFIRMED',
        channel: 'IN_APP',
        recipient: patientUser.email,
        subject: 'Durable Queue Test',
        content: 'Testing durable job persistence',
        idempotencyKey,
      });

      expect(notif).toBeDefined();
      expect(notif.idempotencyKey).toBe(idempotencyKey);

      // Process due jobs
      await NotificationDispatcher.processQueueNow();

      // Check DB: must be SENT
      const updated = await prisma.notification.findUnique({
        where: { id: notif.id },
      });
      expect(updated.status).toBe('SENT');
      expect(updated.sentAt).not.toBeNull();
      expect(updated.processedAt).not.toBeNull();
    });

    it('enforces idempotency preventing duplicate jobs with identical idempotencyKey', async () => {
      const idempotencyKey = `idemp-notif-${Date.now()}`;

      const notif1 = await NotificationDispatcher.dispatch({
        userId: patientUser.id,
        type: 'BOOKING_CONFIRMED',
        channel: 'IN_APP',
        recipient: patientUser.email,
        subject: 'Idempotency Test 1',
        content: 'Original job',
        idempotencyKey,
      });

      const notif2 = await NotificationDispatcher.dispatch({
        userId: patientUser.id,
        type: 'BOOKING_CONFIRMED',
        channel: 'IN_APP',
        recipient: patientUser.email,
        subject: 'Idempotency Test 2',
        content: 'Duplicate attempt with same key',
        idempotencyKey,
      });

      expect(notif1.id).toBe(notif2.id);

      const count = await prisma.notification.count({
        where: { idempotencyKey },
      });
      expect(count).toBe(1);
    });

    it('recovers queued jobs upon worker restart without loss', async () => {
      const restartKey = `restart-test-${Date.now()}`;

      // Simulate a job queued directly before a sudden process termination
      const queuedJob = await prisma.notification.create({
        data: {
          userId: patientUser.id,
          type: 'UPCOMING_REMINDER',
          channel: 'IN_APP',
          recipient: patientUser.email,
          subject: 'Pre-Restart Queued Reminder',
          content: 'This reminder must survive a simulated crash',
          status: 'PENDING',
          idempotencyKey: restartKey,
          nextRetryAt: new Date(Date.now() - 5000), // Due in the past
        },
      });

      // Simulate Worker Restart: create a new worker instance
      const { NotificationQueueWorker } = await import('../../src/modules/notifications/notification-queue.worker.js');
      const restartedWorker = new NotificationQueueWorker();

      // Run worker processing cycle
      const processed = await restartedWorker.processDueJobs();
      expect(processed).toBeGreaterThanOrEqual(1);

      // Verify the pre-crash queued reminder was NOT lost and reached SENT
      const finishedJob = await prisma.notification.findUnique({
        where: { id: queuedJob.id },
      });
      expect(finishedJob.status).toBe('SENT');
      expect(finishedJob.processedAt).not.toBeNull();
    });

    it('recovers stalled PROCESSING jobs left interrupted by a crash', async () => {
      const stalledKey = `stalled-test-${Date.now()}`;

      // Simulate a job interrupted mid-execution (status PROCESSING, old updatedAt)
      const stalledJob = await prisma.notification.create({
        data: {
          userId: patientUser.id,
          type: 'BOOKING_CONFIRMED',
          channel: 'IN_APP',
          recipient: patientUser.email,
          subject: 'Stalled Job',
          content: 'Interrupted during transmission',
          status: 'PROCESSING',
          idempotencyKey: stalledKey,
          updatedAt: new Date(Date.now() - 120000), // 2 minutes ago
        },
      });

      const { NotificationQueueWorker } = await import('../../src/modules/notifications/notification-queue.worker.js');
      const worker = new NotificationQueueWorker();

      // Recover stalled jobs
      const recoveredCount = await worker.recoverStalledJobs(60000);
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      // Verify it was reset to PENDING
      const resetJob = await prisma.notification.findUnique({
        where: { id: stalledJob.id },
      });
      expect(resetJob.status).toBe('PENDING');

      // Now process it to completion
      await worker.processDueJobs();
      const doneJob = await prisma.notification.findUnique({
        where: { id: stalledJob.id },
      });
      expect(doneJob.status).toBe('SENT');
    });

    it('applies retry policy and backoff when channel dispatch fails', async () => {
      const failingEmailChannel = {
        send: async () => ({ success: false, error: 'Simulated SMTP connection timeout' }),
      };

      const { NotificationQueueWorker } = await import('../../src/modules/notifications/notification-queue.worker.js');
      const failingWorker = new NotificationQueueWorker({ emailChannel: failingEmailChannel });

      const failKey = `fail-retry-${Date.now()}`;
      const job = await prisma.notification.create({
        data: {
          userId: patientUser.id,
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          recipient: patientUser.email,
          subject: 'Retry Policy Test',
          content: 'Email will fail',
          status: 'PENDING',
          maxAttempts: 3,
          attempts: 0,
          idempotencyKey: failKey,
          nextRetryAt: new Date(Date.now() - 1000),
        },
      });

      // First attempt
      await failingWorker.processDueJobs();
      const afterAttempt1 = await prisma.notification.findUnique({ where: { id: job.id } });
      expect(afterAttempt1.status).toBe('PENDING');
      expect(afterAttempt1.attempts).toBe(1);
      expect(afterAttempt1.errorMessage).toContain('Simulated SMTP');
      expect(afterAttempt1.nextRetryAt.getTime()).toBeGreaterThan(Date.now());

      // Advance nextRetryAt and execute terminal failure attempt
      await prisma.notification.update({
        where: { id: job.id },
        data: { attempts: 2, nextRetryAt: new Date(Date.now() - 1000) },
      });

      await failingWorker.processDueJobs();
      const afterTerminal = await prisma.notification.findUnique({ where: { id: job.id } });
      expect(afterTerminal.status).toBe('FAILED');
      expect(afterTerminal.attempts).toBe(3);
      expect(afterTerminal.processedAt).not.toBeNull();
    });
  });
});
