import crypto from 'crypto';
import { BaseNotificationChannel } from './base-channel.js';
import { logger } from '../../../config/logger.js';

export class EmailChannel extends BaseNotificationChannel {
  constructor(config = {}) {
    super('EMAIL');
    this.config = config;
  }

  async send({ recipient, subject, content, metadata = {} }) {
    const messageId = `email_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    logger.info({
      channel: this.name,
      recipient,
      subject,
      contentLength: content?.length || 0,
      messageId,
      metadata,
    }, 'Email notification dispatched');

    return {
      success: true,
      messageId,
      recipient,
      sentAt: new Date(),
    };
  }
}
