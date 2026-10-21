import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { env } from '../../config/env.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Extracts a cookie value from request without requiring external dependencies
 */
function getCookie(req, name) {
  if (req.cookies && req.cookies[name]) return req.cookies[name];
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Sets HttpOnly Secure refresh token cookie on response
 */
function setRefreshTokenCookie(res, token) {
  if (token) {
    res.cookie(REFRESH_COOKIE_NAME, token, COOKIE_OPTIONS);
  }
}

/**
 * Clears refresh token cookie on response
 */
function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  });
}

export class AuthController {
  static register = asyncHandler(async (req, res) => {
    const result = await AuthService.registerUser(req.body);
    if (result.tokens?.refreshToken) {
      setRefreshTokenCookie(res, result.tokens.refreshToken);
    }
    return ApiResponse.created(res, 'User registered successfully', result);
  });

  static registerDoctor = asyncHandler(async (req, res) => {
    const result = await AuthService.registerDoctor(req.body);
    if (result.tokens?.refreshToken) {
      setRefreshTokenCookie(res, result.tokens.refreshToken);
    }
    return ApiResponse.created(
      res,
      'Doctor application submitted successfully. Your profile is pending administrative license verification.',
      result
    );
  });

  static login = asyncHandler(async (req, res) => {
    const result = await AuthService.authenticateUser(req.body);
    if (result.tokens?.refreshToken) {
      setRefreshTokenCookie(res, result.tokens.refreshToken);
    }
    return ApiResponse.ok(res, 'Login successful', result);
  });

  static refresh = asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken || getCookie(req, REFRESH_COOKIE_NAME);
    if (!token) {
      throw ApiError.unauthorized('Refresh token is required');
    }
    const result = await AuthService.refreshSession(token);
    if (result.tokens?.refreshToken) {
      setRefreshTokenCookie(res, result.tokens.refreshToken);
    }
    return ApiResponse.ok(res, 'Tokens refreshed successfully', result);
  });

  static logout = asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken || getCookie(req, REFRESH_COOKIE_NAME);
    await AuthService.logout(token);
    clearRefreshTokenCookie(res);
    return ApiResponse.ok(res, 'Logged out successfully');
  });

  static getProfile = asyncHandler(async (req, res) => {
    return ApiResponse.ok(res, 'Authenticated user context retrieved', { user: req.user });
  });

  static mfaSetup = asyncHandler(async (req, res) => {
    const result = await AuthService.setupMfa(req.user.id);
    return ApiResponse.ok(res, 'MFA setup initiated', result);
  });

  static mfaVerify = asyncHandler(async (req, res) => {
    const result = await AuthService.verifyAndEnableMfa(req.user.id, req.body);
    return ApiResponse.ok(res, result.message, result);
  });

  static mfaDisable = asyncHandler(async (req, res) => {
    const result = await AuthService.disableMfa(req.user.id, req.body);
    return ApiResponse.ok(res, result.message, result);
  });

  static mfaLogin = asyncHandler(async (req, res) => {
    const result = await AuthService.completeMfaLogin(req.body);
    if (result.tokens?.refreshToken) {
      setRefreshTokenCookie(res, result.tokens.refreshToken);
    }
    return ApiResponse.ok(res, 'MFA authentication successful', result);
  });
}
