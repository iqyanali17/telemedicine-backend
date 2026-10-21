import { describe, it, expect } from 'vitest';
import { request } from '../helpers/test-client.js';

describe('Health and Readiness Endpoints', () => {
  it('GET /api/v1/health should return 200 with service status', async () => {
    const res = await request.get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'amrutam-telemedicine-backend');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptimeSeconds');
  });

  it('GET / should return 200 and API discovery links', async () => {
    const res = await request.get('/');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Amrutam Telemedicine Backend API');
    expect(res.body).toHaveProperty('health', '/api/v1/health');
    expect(res.body).toHaveProperty('readiness', '/api/v1/ready');
  });

  it('GET /api/v1/metrics should return 200 and telemetry data', async () => {
    const res = await request.get('/api/v1/metrics');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRequests');
    expect(res.body).toHaveProperty('statusCodes');
    expect(res.body).toHaveProperty('latency');
  });

  it('GET /api/v1/ready should return 200 and database connected status', async () => {
    const res = await request.get('/api/v1/ready');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
    expect(res.body).toHaveProperty('service', 'amrutam-telemedicine-backend');
    expect(res.body.dependencies.database).toHaveProperty('status', 'connected');
  });

  it('GET /api-docs/ should serve Swagger UI interactive documentation', async () => {
    const res = await request.get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Swagger UI');
  });
});
