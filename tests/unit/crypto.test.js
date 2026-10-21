import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted, getEncryptionKey } from '../../src/utils/crypto.js';

describe('Unit Tests — Authenticated AES-256-GCM Encryption (src/utils/crypto.js)', () => {
  const samplePlaintext = 'JBSWY3DPEHPK3PXP'; // Base32 TOTP secret

  it('encrypts plaintext into standard enc:gcm format', () => {
    const ciphertext = encrypt(samplePlaintext);
    expect(ciphertext).toBeDefined();
    expect(ciphertext).not.toBe(samplePlaintext);
    expect(isEncrypted(ciphertext)).toBe(true);

    const parts = ciphertext.split(':');
    expect(parts[0]).toBe('enc');
    expect(parts[1]).toBe('gcm');
    expect(parts[2]).toHaveLength(24); // 12-byte IV in hex = 24 chars
    expect(parts[3]).toHaveLength(32); // 16-byte AuthTag in hex = 32 chars
    expect(parts[4].length).toBeGreaterThan(0); // Ciphertext in hex
  });

  it('decrypts encrypted ciphertext back to original plaintext', () => {
    const ciphertext = encrypt(samplePlaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(samplePlaintext);
  });

  it('generates unique ciphertexts (unique IV) for identical plaintexts', () => {
    const cipher1 = encrypt(samplePlaintext);
    const cipher2 = encrypt(samplePlaintext);
    expect(cipher1).not.toBe(cipher2);
    expect(decrypt(cipher1)).toBe(samplePlaintext);
    expect(decrypt(cipher2)).toBe(samplePlaintext);
  });

  it('returns plaintext as-is for legacy non-encrypted strings (backward compatibility)', () => {
    const legacyPlain = 'LEGACYPLAINSECRET123';
    expect(isEncrypted(legacyPlain)).toBe(false);
    expect(decrypt(legacyPlain)).toBe(legacyPlain);
  });

  it('fails with authentication error when ciphertext is tampered', () => {
    const ciphertext = encrypt(samplePlaintext);
    const parts = ciphertext.split(':');
    // Tamper with ciphertext payload
    parts[4] = parts[4].slice(0, -2) + '00';
    const tampered = parts.join(':');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('handles empty or null inputs gracefully', () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt('')).toBe('');
    expect(decrypt(null)).toBeNull();
    expect(decrypt('')).toBe('');
  });

  it('derives a consistent 32-byte key buffer from string keys', () => {
    const key = getEncryptionKey('test-secret-key');
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });
});
