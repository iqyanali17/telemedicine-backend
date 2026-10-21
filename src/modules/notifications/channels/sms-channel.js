import crypto from 'crypto';
import { BaseNotificationChannel } from './base-channel.js';
import { logger } from '../../../config/logger.js';

export class SmsChannel extends BaseNotificationChannel {
  constructor(config = {}) {
    super('SMS');
    this.config = config;
  }

  async send({ recipient, content, metadata = {} }) {
    const messageId = `sms_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    logger.info({
      channel: this.name,
      recipient,
      contentLength: content?.length || 0,
      messageId,
      metadata,
    }, 'SMS notification dispatched');

    return {
      success: true,
      messageId,
      recipient,
      sentAt: new Date(),
    };
  }
}
