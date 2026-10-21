import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

/**
 * Base Video Provider Interface
 * Defines contracts for telemedicine video room and token generation
 */
export class BaseVideoProvider {
  /**
   * Generates room credentials and descriptors for a consultation
   * @param {object} consultation
   * @returns {Promise<{ roomId: string, roomUrl: string, provider: string }>}
   */
  async generateRoom(_consultation) {
    throw new Error('generateRoom must be implemented by provider');
  }

  /**
   * Generates a short-lived access token for a participant joining the room
   * @param {object} user - Authenticated user context
   * @param {string} role - 'DOCTOR' | 'PATIENT' | 'ADMIN'
   * @param {object} session - VideoSession entity
   * @param {object} consultation - Consultation entity
   * @returns {Promise<{ token: string, expiresAt: Date, permissions: object }>}
   */
  async generateAccessToken(_user, _role, _session, _consultation) {
    throw new Error('generateAccessToken must be implemented by provider');
  }

  /**
   * Terminates a video room
   * @param {string} roomId
   */
  async terminateRoom(_roomId) {
    throw new Error('terminateRoom must be implemented by provider');
  }
}

/**
 * Mock WebRTC Provider (Development & Testing)
 * Implements a standards-compliant WebRTC room descriptor with cryptographically signed tokens
 */
class MockWebRtcProvider extends BaseVideoProvider {
  async generateRoom(consultation) {
    const uniqueHash = crypto
      .createHash('sha256')
      .update(`${consultation.id}-${consultation.consultationNumber}`)
      .digest('hex')
      .slice(0, 16);
    const roomId = `telemedicine-room-${uniqueHash}`;
    const roomUrl = `https://${process.env.VIDEO_JITSI_DOMAIN || 'meet.jit.si'}/${roomId}`;

    return {
      roomId,
      roomUrl,
      provider: 'MOCK_WEBRTC',
    };
  }

  async generateAccessToken(user, role, session, consultation) {
    const isDoctor = role === 'DOCTOR';
    const isAdmin = role === 'ADMIN';
    const isModerator = isDoctor || isAdmin;

    const permissions = {
      canPublishAudio: true,
      canPublishVideo: true,
      canScreenShare: isModerator,
      isModerator,
      canRecordSession: isModerator,
    };

    const payload = {
      sub: user.id,
      email: user.email,
      role,
      roomId: session.roomId,
      consultationId: consultation.id,
      permissions,
      jti: crypto.randomUUID(),
    };

    const token = jwt.sign(payload, env.VIDEO_JWT_SECRET, {
      expiresIn: '1h',
      audience: 'amrutam-telemedicine-video',
      issuer: 'amrutam-backend',
    });

    return {
      token,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      permissions,
    };
  }

  async terminateRoom(_roomId) {
    return { success: true, terminatedAt: new Date() };
  }
}

/**
 * Jitsi Meet Provider
 * Standards-compliant Jitsi Meet integration supporting self-hosted or meet.jit.si with JWT moderation
 */
class JitsiMeetProvider extends BaseVideoProvider {
  async generateRoom(consultation) {
    const cleanNumber = consultation.consultationNumber.replace(/[^a-zA-Z0-9]/g, '');
    const roomId = `amrutam_${cleanNumber}_${crypto.randomBytes(3).toString('hex')}`;
    const roomUrl = `https://${env.VIDEO_JITSI_DOMAIN}/${roomId}`;

    return {
      roomId,
      roomUrl,
      provider: 'JITSI',
    };
  }

  async generateAccessToken(user, role, session, consultation) {
    const isModerator = role === 'DOCTOR' || role === 'ADMIN';

    const permissions = {
      canPublishAudio: true,
      canPublishVideo: true,
      canScreenShare: isModerator,
      isModerator,
      canRecordSession: isModerator,
    };

    const payload = {
      context: {
        user: {
          id: user.id,
          name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email,
          email: user.email,
          avatar: null,
        },
        features: {
          recording: isModerator,
          livestreaming: false,
          'screen-sharing': true,
        },
      },
      aud: env.VIDEO_JITSI_APP_ID,
      iss: env.VIDEO_JITSI_APP_ID,
      sub: env.VIDEO_JITSI_DOMAIN,
      room: session.roomId,
      moderator: isModerator,
      consultationId: consultation.id,
    };

    const token = jwt.sign(payload, env.VIDEO_JWT_SECRET, { expiresIn: '1h' });

    return {
      token,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      permissions,
    };
  }

  async terminateRoom(_roomId) {
    return { success: true, terminatedAt: new Date() };
  }
}

/**
 * Factory providing the configured Video Provider instance
 */
export const getVideoProvider = () => {
  switch (env.VIDEO_PROVIDER) {
    case 'JITSI':
      return new JitsiMeetProvider();
    case 'MOCK_WEBRTC':
    default:
      return new MockWebRtcProvider();
  }
};
