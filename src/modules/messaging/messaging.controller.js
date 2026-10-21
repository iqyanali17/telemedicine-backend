import { MessagingService } from './messaging.service.js';

export class MessagingController {
  /**
   * Send a message in a consultation
   */
  static async sendMessage(req, res, next) {
    try {
      const message = await MessagingService.sendMessage(req.user, req.params.id, req.body);
      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get paginated messages for a consultation
   */
  static async getMessages(req, res, next) {
    try {
      const result = await MessagingService.getMessages(req.user, req.params.id, req.query);
      res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload a medical attachment for a consultation
   */
  static async uploadAttachment(req, res, next) {
    try {
      const attachment = await MessagingService.uploadAttachment(
        req.user,
        req.params.id,
        req.body
      );
      res.status(201).json({
        success: true,
        data: attachment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download a private medical attachment
   */
  static async downloadAttachment(req, res, next) {
    try {
      const { stream, attachment } = await MessagingService.getAttachmentStream(
        req.user,
        req.params.id,
        req.params.attachmentId
      );

      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.fileName)}"`
      );
      res.setHeader('Content-Length', attachment.fileSize);

      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all attachments for a consultation
   */
  static async listAttachments(req, res, next) {
    try {
      const attachments = await MessagingService.listAttachments(req.user, req.params.id);
      res.status(200).json({
        success: true,
        data: attachments,
      });
    } catch (error) {
      next(error);
    }
  }
}
