import { describe, it, expect } from 'vitest';
import { request } from '../helpers/test-client.js';

describe('Error Handling Middleware', () => {
  it('should return structured 404 for undefined routes', async () => {
    const res = await request.get('/api/v1/non-existent-route-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('statusCode', 404);
    expect(res.body.message).toMatch(/Route not found/);
  });

  it('should return 422 with validation errors when registering with invalid email', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid-email-format',
        password: 'short',
        firstName: '',
        lastName: '',
      });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('statusCode', 422);
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('should return 401 when accessing protected route without token', async () => {
    const res = await request.get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('statusCode', 401);
    expect(res.body.message).toMatch(/token missing/i);
  });
});
