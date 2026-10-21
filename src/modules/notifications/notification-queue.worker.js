import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { EmailChannel } from './channels/email-channel.js';
import { SmsChannel } from './channels/sms-channel.js';

export class NotificationQueueWorker {
  constructor({ emailChannel, smsChannel } = {}) {
    this.emailChannel = emailChannel || new EmailChannel();
    this.smsChannel = smsChannel || new SmsChannel();
    this.timer = null;
    this.isProcessing = false;
  }

  /**
   * Recovers jobs that were left in PROCESSING state when server crashed/restarted
   * @param {number} stalledTimeoutMs - Age in ms after which a PROCESSING job is considered dead
   */
  async recoverStalledJobs(stalledTimeoutMs = 60000) {
    const cutoff = new Date(Date.now() - stalledTimeoutMs);
    try {
      const recovered = await prisma.notification.updateMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lte: cutoff },
        },
        data: {
          status: 'PENDING',
          nextRetryAt: new Date(),
        },
      });

      if (recovered.count > 0) {
        logger.warn({ count: recovered.count }, 'Recovered stalled notification jobs from interrupted worker');
      }

      return recovered.count;
    } catch (err) {
      logger.error({ err }, 'Failed to recover stalled notification jobs');
      return 0;
    }
  }

  /**
   * Processes a batch of due pending notification jobs with atomic row locking and exponential backoff
   * @param {number} batchSize
   */
  async processDueJobs(batchSize = 20) {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const now = new Date();
      const dueJobs = await prisma.notification.findMany({
        where: {
          status: 'PENDING',
          nextRetryAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });

      for (const job of dueJobs) {
        // Atomic lock transition to PROCESSING
        const lock = await prisma.notification.updateMany({
          where: { id: job.id, status: 'PENDING' },
          data: { status: 'PROCESSING' },
        });

        if (lock.count === 0) continue; // Acquired by another worker

        let channelResult = { success: true };
        try {
          if (job.channel === 'EMAIL' && job.recipient) {
            channelResult = await this.emailChannel.send({
              recipient: job.recipient,
              subject: job.subject,
              content: job.content,
              metadata: job.metadata,
            });
          } else if (job.channel === 'SMS' && job.recipient) {
            channelResult = await this.smsChannel.send({
              recipient: job.recipient,
              content: job.content,
              metadata: job.metadata,
            });
          }
        } catch (err) {
          channelResult = { success: false, error: err.message };
        }

        if (channelResult.success) {
          await prisma.notification.update({
            where: { id: job.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              processedAt: new Date(),
              errorMessage: null,
            },
          });
        } else {
          const nextAttempts = job.attempts + 1;
          const isTerminal = nextAttempts >= job.maxAttempts;
          const backoffMs = Math.min(300000, Math.pow(2, nextAttempts) * 1000);

          await prisma.notification.update({
            where: { id: job.id },
            data: {
              status: isTerminal ? 'FAILED' : 'PENDING',
              attempts: nextAttempts,
              errorMessage: channelResult.error || 'Notification delivery failed',
              nextRetryAt: isTerminal ? null : new Date(Date.now() + backoffMs),
              processedAt: isTerminal ? new Date() : null,
            },
          });

          logger.warn(
            { jobId: job.id, attempts: nextAttempts, isTerminal, err: channelResult.error },
            'Notification delivery attempt failed'
          );
        }

        processedCount++;
      }
    } catch (err) {
      logger.error({ err }, 'Error during notification queue processing loop');
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Starts periodic polling loop
   */
  start(pollIntervalMs = 5000) {
    if (this.timer) return;

    // Immediately run recovery and process any pending jobs on startup
    this.recoverStalledJobs().then(() => this.processDueJobs()).catch(() => {});

    this.timer = setInterval(() => {
      this.processDueJobs().catch(() => {});
    }, pollIntervalMs);

    if (this.timer.unref) {
      this.timer.unref(); // Do not block Node event loop during shutdown or test runners
    }
  }

  /**
   * Stops polling loop
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const notificationQueueWorker = new NotificationQueueWorker();
