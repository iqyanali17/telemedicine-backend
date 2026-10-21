/**
 * Base notification channel provider
 */
export class BaseNotificationChannel {
  constructor(name) {
    this.name = name;
  }

  /**
   * Send notification through channel
   * @param {object} params
   * @param {string} params.recipient
   * @param {string} [params.subject]
   * @param {string} params.content
   * @param {object} [params.metadata]
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
   */
  async send() {
    throw new Error(`send() must be implemented by channel ${this.name}`);
  }
}
