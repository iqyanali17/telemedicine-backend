import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';
import { prisma } from '../../src/config/database.js';
import { TotpUtil } from '../../src/utils/totp.js';
import { decrypt, isEncrypted } from '../../src/utils/crypto.js';

describe('Phase 3.6 — Security Hardening, MFA & Token Lifecycle Protection', () => {
  let user;
  const userPassword = 'Password123!';
  let generatedSecret;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(userPassword, 10);
    user = await prisma.user.create({
      data: {
        email: `mfa.user.${Date.now()}@amrutam.test`,
        passwordHash,
        role: 'PATIENT',
        isMfaEnabled: false,
        profile: { create: { firstName: 'Arya', lastName: 'Bhat' } },
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { userId: user.id } });
      await prisma.userProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    } catch {
      // Ignored
    }
  });

  describe('1. RFC 6238 TOTP Engine Unit Contracts', () => {
    it('generates Base32 secret and valid 6-digit TOTP token', () => {
      const secret = TotpUtil.generateSecret(20);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(32);

      const token = TotpUtil.generateTotp(secret);
      expect(token).toMatch(/^\d{6}$/);

      expect(TotpUtil.verifyTotp(secret, token)).toBe(true);
      expect(TotpUtil.verifyTotp(secret, '000000')).toBe(false);
      expect(TotpUtil.verifyTotp(secret, 'invalid')).toBe(false);
    });

    it('verifies TOTP across standard 30-second time drift window', () => {
      const secret = TotpUtil.generateSecret(20);
      const now = Date.now();
      const currentToken = TotpUtil.generateTotp(secret, now);

      // Verify at current time
      expect(TotpUtil.verifyTotp(secret, currentToken, { timeMs: now })).toBe(true);

      // Verify with +25 second offset (within 1-step window)
      expect(TotpUtil.verifyTotp(secret, currentToken, { timeMs: now + 25000 })).toBe(true);

      // Verify with -25 second offset (within 1-step window)
      expect(TotpUtil.verifyTotp(secret, currentToken, { timeMs: now - 25000 })).toBe(true);

      // Verify with +120 second offset (outside window)
      expect(TotpUtil.verifyTotp(secret, currentToken, { timeMs: now + 120000 })).toBe(false);
    });

    it('generates standard RFC 6238 otpauth URI for QR enrollment', () => {
      const secret = TotpUtil.generateSecret(20);
      const uri = TotpUtil.getOtpAuthUri(secret, 'test@example.com');

      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });
  });

  describe('2. MFA Enrollment & Verification (POST /auth/mfa/setup, POST /auth/mfa/verify)', () => {
    it('rejects unauthenticated MFA setup request (401)', async () => {
      const res = await request.post('/api/v1/auth/mfa/setup');
      expect(res.status).toBe(401);
    });

    it('generates MFA setup secret and otpauth URI for authenticated user', async () => {
      const res = await request
        .post('/api/v1/auth/mfa/setup')
        .set(getAuthHeader(user));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.secret).toBeDefined();
      expect(res.body.data.otpAuthUri).toBeDefined();

      generatedSecret = res.body.data.secret;
    });

    it('rejects verification with invalid 6-digit TOTP code (422)', async () => {
      const res = await request
        .post('/api/v1/auth/mfa/verify')
        .set(getAuthHeader(user))
        .send({
          secret: generatedSecret,
          code: '000000',
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/invalid.*code/i);
    });

    it('successfully activates MFA with valid 6-digit TOTP code', async () => {
      const validCode = TotpUtil.generateTotp(generatedSecret);

      const res = await request
        .post('/api/v1/auth/mfa/verify')
        .set(getAuthHeader(user))
        .send({
          secret: generatedSecret,
          code: validCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user state in database: mfaSecret MUST be encrypted at rest
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser.isMfaEnabled).toBe(true);
      expect(isEncrypted(updatedUser.mfaSecret)).toBe(true);
      expect(updatedUser.mfaSecret).not.toBe(generatedSecret);
      expect(decrypt(updatedUser.mfaSecret)).toBe(generatedSecret);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: { userId: user.id, action: 'MFA_ENABLED' },
      });
      expect(audit).not.toBeNull();
    });

    it('prevents setting up MFA again when already active (409)', async () => {
      const res = await request
        .post('/api/v1/auth/mfa/setup')
        .set(getAuthHeader(user));

      expect(res.status).toBe(409);
    });
  });

  describe('3. Two-Step MFA Login Challenge (POST /auth/login, POST /auth/mfa/login)', () => {
    let mfaSessionToken;

    it('first step login returns mfaRequired and mfaSessionToken for MFA-enabled user', async () => {
      const res = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: userPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mfaRequired).toBe(true);
      expect(res.body.data.mfaSessionToken).toBeDefined();
      expect(res.body.data.tokens).toBeUndefined(); // Access token is withheld!

      mfaSessionToken = res.body.data.mfaSessionToken;
    });

    it('rejects mfa login challenge with invalid 6-digit code (401)', async () => {
      const res = await request
        .post('/api/v1/auth/mfa/login')
        .send({
          mfaSessionToken,
          code: '999999',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid.*code/i);
    });

    it('rejects mfa login challenge with forged or tampered session token (401)', async () => {
      const res = await request
        .post('/api/v1/auth/mfa/login')
        .send({
          mfaSessionToken: 'eyJh.forged.token',
          code: '123456',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired or invalid/i);
    });

    it('successfully completes login challenge with valid 6-digit TOTP code', async () => {
      const validCode = TotpUtil.generateTotp(generatedSecret);

      const res = await request
        .post('/api/v1/auth/mfa/login')
        .send({
          mfaSessionToken,
          code: validCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens).toBeDefined();
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(user.email);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: { userId: user.id, action: 'MFA_LOGIN_SUCCESS' },
      });
      expect(audit).not.toBeNull();
    });

    it('REPLAY DEFENSE: rejects replay of the same TOTP code for the same time-step', async () => {
      // 1. Authenticate again to obtain a fresh mfaSessionToken
      const loginRes = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: userPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.mfaRequired).toBe(true);
      const secondMfaToken = loginRes.body.data.mfaSessionToken;

      // 2. Re-submit the exact same TOTP code that was already accepted
      const replayCode = TotpUtil.generateTotp(generatedSecret);

      const replayRes = await request
        .post('/api/v1/auth/mfa/login')
        .send({
          mfaSessionToken: secondMfaToken,
          code: replayCode,
        });

      // Must be rejected with 401
      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toMatch(/already been used/i);
    });

    it('CONCURRENCY DEFENSE: rejects simultaneous concurrent verification of the same TOTP code', async () => {
      // 1. Get two separate MFA session tokens
      const [login1, login2] = await Promise.all([
        request.post('/api/v1/auth/login').send({ email: user.email, password: userPassword }),
        request.post('/api/v1/auth/login').send({ email: user.email, password: userPassword }),
      ]);

      const token1 = login1.body.data.mfaSessionToken;
      const token2 = login2.body.data.mfaSessionToken;

      // Reset lastTotpCounter to null to simulate race for a fresh counter
      await prisma.user.update({
        where: { id: user.id },
        data: { lastTotpCounter: null },
      });

      const freshCode = TotpUtil.generateTotp(generatedSecret, Date.now());

      // Execute both verification requests simultaneously
      const [res1, res2] = await Promise.all([
        request.post('/api/v1/auth/mfa/login').send({ mfaSessionToken: token1, code: freshCode }),
        request.post('/api/v1/auth/mfa/login').send({ mfaSessionToken: token2, code: freshCode }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200) and the other must be rejected (401)
      expect(statuses).toEqual([200, 401]);
    });
  });

  describe('4. Disabling MFA (POST /auth/mfa/disable)', () => {
    it('rejects disabling MFA with incorrect password (401)', async () => {
      const validCode = TotpUtil.generateTotp(generatedSecret);

      const res = await request
        .post('/api/v1/auth/mfa/disable')
        .set(getAuthHeader(user))
        .send({
          password: 'WrongPassword!',
          code: validCode,
        });

      expect(res.status).toBe(401);
    });

    it('rejects disabling MFA with invalid TOTP code (401)', async () => {
      const res = await request
        .post('/api/v1/auth/mfa/disable')
        .set(getAuthHeader(user))
        .send({
          password: userPassword,
          code: '000000',
        });

      expect(res.status).toBe(401);
    });

    it('successfully disables MFA and revokes existing sessions', async () => {
      const validCode = TotpUtil.generateTotp(generatedSecret);

      const res = await request
        .post('/api/v1/auth/mfa/disable')
        .set(getAuthHeader(user))
        .send({
          password: userPassword,
          code: validCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser.isMfaEnabled).toBe(false);
      expect(updatedUser.mfaSecret).toBeNull();
    });
  });

  describe('5. Token Rotation & Replay Detection Security', () => {
    it('detects refresh token reuse and revokes all user sessions', async () => {
      // 1. Login to get fresh tokens
      const loginRes = await request
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: userPassword,
        });

      expect(loginRes.status).toBe(200);
      const initialRefreshToken = loginRes.body.data.tokens.refreshToken;

      // 2. Perform legitimate token rotation
      const refreshRes = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.tokens.refreshToken).toBeDefined();
      const newRefreshToken = refreshRes.body.data.tokens.refreshToken;
      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // 3. Attack Simulation: Replay the already-used initialRefreshToken
      const replayRes = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      // Reuse detection must reject with 401
      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toMatch(/reused|revoked/i);

      // 4. Verify that even the legitimate newRefreshToken was revoked as a security measure
      const subsequentRes = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(subsequentRes.status).toBe(401);
    });
  });
});
