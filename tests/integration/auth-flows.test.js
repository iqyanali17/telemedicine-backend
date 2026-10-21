import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { request } from '../helpers/test-client.js';
import { env } from '../../src/config/env.js';

describe('Authentication Flows and Token Validation', () => {
  const uniqueEmail = `test.audit.${Date.now()}@example.com`;
  let refreshToken = '';
  let rotatedRefreshToken = '';

  it('POST /api/v1/auth/register should create user and return tokens', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail,
        password: 'AuditPassword123!',
        firstName: 'Audit',
        lastName: 'Tester',
        role: 'PATIENT',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(uniqueEmail);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('POST /api/v1/auth/register with duplicate email should return 409 Conflict', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail,
        password: 'AuditPassword123!',
        firstName: 'Audit',
        lastName: 'Tester',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('POST /api/v1/auth/register with duplicate phone should return 409 Conflict', async () => {
    const sharedPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const emailA = `phone.test.a.${Date.now()}.${Math.random()}@example.com`;
    const emailB = `phone.test.b.${Date.now()}.${Math.random()}@example.com`;

    const resA = await request.post('/api/v1/auth/register').send({
      email: emailA,
      password: 'AuditPassword123!',
      firstName: 'Phone',
      lastName: 'UserA',
      phone: sharedPhone,
    });
    expect(resA.status).toBe(201);

    const resB = await request.post('/api/v1/auth/register').send({
      email: emailB,
      password: 'AuditPassword123!',
      firstName: 'Phone',
      lastName: 'UserB',
      phone: sharedPhone,
    });
    expect(resB.status).toBe(409);
    expect(resB.body.success).toBe(false);
    expect(resB.body.message).toMatch(/phone number already exists/i);
  });

  it('POST /api/v1/auth/login with valid credentials should succeed', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({
        email: uniqueEmail,
        password: 'AuditPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify Set-Cookie header contains HttpOnly Secure refreshToken cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('refreshToken=') && c.includes('HttpOnly'))).toBe(true);

    expect(res.body.data.tokens).toHaveProperty('accessToken');
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('POST /api/v1/auth/login with incorrect password should return 401', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({
        email: uniqueEmail,
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  it('POST /api/v1/auth/login with non-existent email should return 401', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({
        email: 'does.not.exist@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/auth/me without authorization header should return 401', async () => {
    const res = await request.get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/token missing or invalid/i);
  });

  it('GET /api/v1/auth/me with malformed token should return 401', async () => {
    const res = await request
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-valid-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid authentication token/i);
  });

  it('GET /api/v1/auth/me with expired token should return 401', async () => {
    const expiredToken = jwt.sign(
      { sub: 'test-user', email: 'test@example.com', role: 'PATIENT' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('POST /api/v1/auth/refresh with valid refresh token should rotate and issue new tokens', async () => {
    const res = await request
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');

    // Verify updated cookie is set on refresh
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('refreshToken=') && c.includes('HttpOnly'))).toBe(true);

    rotatedRefreshToken = res.body.data.tokens.refreshToken;
  });

  it('POST /api/v1/auth/refresh using Cookie header should rotate tokens successfully', async () => {
    // Refresh using Cookie instead of request body
    const res = await request
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${rotatedRefreshToken}`])
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');

    // Update rotated token for next steps
    rotatedRefreshToken = res.body.data.tokens.refreshToken;
  });

  it('POST /api/v1/auth/refresh reusing old rotated token should be rejected (reuse detection)', async () => {
    // Attempt to use the original refreshToken which was rotated
    const res = await request
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/auth/logout should revoke the active refresh token and clear cookie', async () => {
    const res = await request
      .post('/api/v1/auth/logout')
      .set('Cookie', [`refreshToken=${rotatedRefreshToken}`])
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/logged out successfully/i);

    // Verify clear cookie header
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('refreshToken=;') || c.includes('Max-Age=0'))).toBe(true);

    // Verifying subsequent refresh attempt fails
    const refreshRes = await request
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh with invalid refresh token should return 401', async () => {
    const res = await request
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
