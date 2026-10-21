import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 encoding for RFC 4648
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Base32 decoding for RFC 4648
 */
function base32Decode(base32Str) {
  const cleaned = base32Str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * RFC 6238 TOTP Engine
 */
export class TotpUtil {
  /**
   * Generates a random Base32 secret key (20 bytes / 160 bits)
   */
  static generateSecret(byteLength = 20) {
    const randomBytes = crypto.randomBytes(byteLength);
    return base32Encode(randomBytes);
  }

  /**
   * Calculates a 6-digit TOTP code for a secret and time
   */
  static generateTotp(base32Secret, timeMs = Date.now(), stepSeconds = 30) {
    const key = base32Decode(base32Secret);
    const counter = Math.floor(timeMs / 1000 / stepSeconds);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Verifies a 6-digit TOTP code and returns verification result along with the matched time-step counter
   */
  static verifyTotpWithCounter(base32Secret, token, { window = 1, timeMs = Date.now(), stepSeconds = 30 } = {}) {
    if (!token || typeof token !== 'string' || token.length !== 6 || !/^\d{6}$/.test(token)) {
      return { isValid: false, matchedCounter: null };
    }

    try {
      const currentCounter = Math.floor(timeMs / 1000 / stepSeconds);
      const tokenBuffer = Buffer.from(token, 'utf8');

      for (let i = -window; i <= window; i++) {
        const stepTime = (currentCounter + i) * stepSeconds * 1000;
        const expected = this.generateTotp(base32Secret, stepTime, stepSeconds);
        const expectedBuffer = Buffer.from(expected, 'utf8');

        if (tokenBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
          return { isValid: true, matchedCounter: BigInt(currentCounter + i) };
        }
      }

      return { isValid: false, matchedCounter: null };
    } catch {
      return { isValid: false, matchedCounter: null };
    }
  }

  /**
   * Verifies a 6-digit TOTP code with time drift window (default ±1 step = ±30s)
   */
  static verifyTotp(base32Secret, token, options) {
    return this.verifyTotpWithCounter(base32Secret, token, options).isValid;
  }

  /**
   * Generates standard RFC 6238 otpauth URI for QR codes and authenticator apps
   */
  static getOtpAuthUri(base32Secret, email, issuer = 'Amrutam Telemedicine') {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${base32Secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }
}
