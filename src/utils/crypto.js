import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Derives a consistent 32-byte Buffer key from secret string
 * @param {string} [customKey]
 * @returns {Buffer}
 */
export function getEncryptionKey(customKey) {
  const secret = customKey || env.MFA_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('MFA_ENCRYPTION_KEY must be provided via .env');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string using authenticated AES-256-GCM
 * @param {string} plainText
 * @param {string} [customKey]
 * @returns {string} Formatted as "enc:gcm:<iv_hex>:<authTag_hex>:<cipher_hex>"
 */
export function encrypt(plainText, customKey) {
  if (!plainText) return plainText;

  const key = getEncryptionKey(customKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `enc:gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string, supporting legacy plaintext fallback
 * @param {string} cipherText
 * @param {string} [customKey]
 * @returns {string}
 */
export function decrypt(cipherText, customKey) {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;

  // Seamless backward compatibility: if not in enc:gcm format, return as-is
  if (!cipherText.startsWith('enc:gcm:')) {
    return cipherText;
  }

  const parts = cipherText.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted payload structure');
  }

  const [, , ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey(customKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Checks if a string is encrypted in enc:gcm format
 * @param {string} text
 * @returns {boolean}
 */
export function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith('enc:gcm:');
}
