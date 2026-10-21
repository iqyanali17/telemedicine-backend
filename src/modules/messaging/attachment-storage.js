import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ApiError } from '../../utils/api-error.js';

const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), 'storage/secure_attachments');

// Ensure directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export class AttachmentStorage {
  /**
   * Sanitizes file name preventing path traversal attacks
   */
  static sanitizeFileName(fileName) {
    const base = path.basename(fileName);
    return base.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  }

  /**
   * Validates file header magic bytes against declared MIME type
   */
  static validateMagicBytes(buffer, mimeType) {
    if (!buffer || buffer.length < 4) {
      throw ApiError.unprocessable('Uploaded file content is empty or corrupted');
    }

    switch (mimeType) {
      case 'application/pdf': {
        // PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
        const header = buffer.subarray(0, 4).toString('ascii');
        if (!header.startsWith('%PDF')) {
          throw ApiError.unprocessable('File contents do not match application/pdf signature');
        }
        break;
      }
      case 'image/jpeg': {
        // JPEG magic bytes: 0xFF 0xD8 0xFF
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
          throw ApiError.unprocessable('File contents do not match image/jpeg signature');
        }
        break;
      }
      case 'image/png': {
        // PNG magic bytes: 0x89 0x50 0x4E 0x47
        if (
          buffer[0] !== 0x89 ||
          buffer[1] !== 0x50 ||
          buffer[2] !== 0x4e ||
          buffer[3] !== 0x47
        ) {
          throw ApiError.unprocessable('File contents do not match image/png signature');
        }
        break;
      }
      case 'image/webp': {
        // WEBP: RIFF....WEBP
        const riff = buffer.subarray(0, 4).toString('ascii');
        const webp = buffer.subarray(8, 12).toString('ascii');
        if (riff !== 'RIFF' || webp !== 'WEBP') {
          throw ApiError.unprocessable('File contents do not match image/webp signature');
        }
        break;
      }
      default:
        throw ApiError.unprocessable(`Unsupported MIME type: ${mimeType}`);
    }
  }

  /**
   * Persists file buffer into private secure storage
   */
  static async saveAttachment(fileName, buffer) {
    const cleanName = this.sanitizeFileName(fileName);
    const uniqueKey = `${Date.now()}_${crypto.randomUUID()}_${cleanName}`;
    const destinationPath = path.join(STORAGE_DIR, uniqueKey);

    // Defense-in-depth: Verify path remains inside STORAGE_DIR
    const resolvedPath = path.resolve(destinationPath);
    if (!resolvedPath.startsWith(STORAGE_DIR)) {
      throw ApiError.forbidden('Invalid storage path resolution');
    }

    await fs.promises.writeFile(resolvedPath, buffer);

    return {
      fileKey: uniqueKey,
      filePath: resolvedPath,
      fileSize: buffer.length,
    };
  }

  /**
   * Returns a readable stream for a private file
   */
  static getAttachmentStream(fileKey) {
    const cleanKey = path.basename(fileKey);
    const resolvedPath = path.resolve(STORAGE_DIR, cleanKey);

    if (!resolvedPath.startsWith(STORAGE_DIR) || !fs.existsSync(resolvedPath)) {
      throw ApiError.notFound('Medical attachment file not found on storage provider');
    }

    return fs.createReadStream(resolvedPath);
  }

  /**
   * Deletes a private file
   */
  static async deleteAttachment(fileKey) {
    const cleanKey = path.basename(fileKey);
    const resolvedPath = path.resolve(STORAGE_DIR, cleanKey);

    if (resolvedPath.startsWith(STORAGE_DIR) && fs.existsSync(resolvedPath)) {
      await fs.promises.unlink(resolvedPath);
    }
  }
}
