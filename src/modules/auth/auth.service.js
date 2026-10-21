import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';
import { TotpUtil } from '../../utils/totp.js';
import { encrypt, decrypt } from '../../utils/crypto.js';

export class AuthService {
  /**
   * Generates access and refresh tokens for authenticated user
   */
  static generateTokens(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Hashes a refresh token for safe database persistence
   */
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Persists a refresh token session in the database
   */
  static async persistRefreshToken(userId, refreshToken) {
    const decoded = jwt.decode(refreshToken);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 86400000);
    const tokenHash = this.hashToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  /**
   * Registers a new user with profile in a single atomic transaction
   */
  static async registerUser({ email, password, firstName, lastName, phone }) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const cleanPhone = phone && phone.trim() ? phone.trim() : null;
    if (cleanPhone) {
      const existingPhone = await prisma.profile.findFirst({
        where: { phone: cleanPhone },
      });
      if (existingPhone) {
        throw ApiError.conflict('An account with this phone number already exists');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'PATIENT', // Public registration is strictly restricted to PATIENT role
        profile: {
          create: {
            firstName,
            lastName,
            phone: cleanPhone,
          },
        },
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    const tokens = this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return { user, tokens };
  }

  /**
   * Authenticates user credentials
   */
  static async authenticateUser({ email, password }) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // Two-factor authentication challenge
    if (user.isMfaEnabled) {
      const mfaSessionToken = jwt.sign(
        { sub: user.id, mfaPending: true },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '5m' }
      );

      return {
        mfaRequired: true,
        mfaSessionToken,
      };
    }

    const { passwordHash: _, mfaSecret: __, ...safeUser } = user;
    const tokens = this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return { user: safeUser, tokens };
  }

  /**
   * Refreshes access token with rotation and reuse detection
   */
  static async refreshSession(refreshToken) {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const existingToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Reuse detection: if token is already revoked, invalidate all sessions for this user
    if (existingToken?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: decoded.sub },
        data: { revokedAt: new Date() },
      });
      throw ApiError.unauthorized('Revoked refresh token reused. All sessions terminated.');
    }

    // Must exist in persistence store and not be expired
    if (!existingToken) {
      throw ApiError.unauthorized('Invalid or unrecognised refresh token session');
    }

    if (existingToken.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token session has expired');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User not found or inactive');
    }

    // Revoke previous token (rotation)
    await prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    // Issue new token pair
    const tokens = this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    return { tokens };
  }

  /**
   * Revokes a refresh token on logout
   */
  static async logout(refreshToken) {
    if (!refreshToken) return;
    const tokenHash = this.hashToken(refreshToken);

    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes all active refresh tokens for a user
   */
  static async revokeAllUserSessions(userId) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Completes login challenge using 6-digit TOTP code
   */
  static async completeMfaLogin({ mfaSessionToken, code }) {
    let payload;
    try {
      payload = jwt.verify(mfaSessionToken, env.JWT_ACCESS_SECRET);
    } catch {
      throw ApiError.unauthorized('MFA session expired or invalid');
    }

    if (!payload.mfaPending || !payload.sub) {
      throw ApiError.unauthorized('Invalid MFA challenge payload');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User not found or inactive');
    }

    if (!user.isMfaEnabled || !user.mfaSecret) {
      throw ApiError.conflict('Two-factor authentication is not configured for this user');
    }

    const plainSecret = decrypt(user.mfaSecret);
    const verification = TotpUtil.verifyTotpWithCounter(plainSecret, code);
    if (!verification.isValid) {
      throw ApiError.unauthorized('Invalid two-factor authentication code');
    }

    // Atomic update preventing replay and concurrent reuse
    const lock = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { lastTotpCounter: null },
          { lastTotpCounter: { lt: verification.matchedCounter } },
        ],
      },
      data: {
        lastTotpCounter: verification.matchedCounter,
      },
    });

    if (lock.count === 0) {
      throw ApiError.unauthorized(
        'Two-factor authentication code has already been used. Please wait for the next code.'
      );
    }

    const { passwordHash: _, mfaSecret: __, lastTotpCounter: ___, ...safeUser } = user;
    const tokens = this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'MFA_LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return { user: safeUser, tokens };
  }

  /**
   * Generates a new TOTP secret and otpauth URI for user enrollment
   */
  static async setupMfa(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.isMfaEnabled) {
      throw ApiError.conflict('Two-factor authentication is already active on this account');
    }

    const secret = TotpUtil.generateSecret(20);
    const otpAuthUri = TotpUtil.getOtpAuthUri(secret, user.email);

    return {
      secret,
      otpAuthUri,
    };
  }

  /**
   * Verifies initial TOTP code and activates MFA for user account
   */
  static async verifyAndEnableMfa(userId, { secret, code }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.isMfaEnabled) {
      throw ApiError.conflict('Two-factor authentication is already enabled');
    }

    const verification = TotpUtil.verifyTotpWithCounter(secret, code);
    if (!verification.isValid) {
      throw ApiError.unprocessable('Invalid TOTP verification code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isMfaEnabled: true,
        mfaSecret: encrypt(secret),
        lastTotpCounter: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'MFA_ENABLED',
        entityType: 'User',
        entityId: userId,
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication successfully enabled',
    };
  }

  /**
   * Disables MFA after verifying password and current TOTP code
   */
  static async disableMfa(userId, { password, code }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.isMfaEnabled || !user.mfaSecret) {
      throw ApiError.conflict('Two-factor authentication is not enabled on this account');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid password verification');
    }

    const plainSecret = decrypt(user.mfaSecret);
    const isValid = TotpUtil.verifyTotp(plainSecret, code);
    if (!isValid) {
      throw ApiError.unauthorized('Invalid two-factor authentication code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isMfaEnabled: false,
        mfaSecret: null,
        lastTotpCounter: null,
      },
    });

    // Invalidate existing sessions for security
    await this.revokeAllUserSessions(userId);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'MFA_DISABLED',
        entityType: 'User',
        entityId: userId,
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication successfully disabled',
    };
  }
}

