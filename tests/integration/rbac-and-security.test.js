import { describe, it, expect } from 'vitest';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';

describe('Role-Based Access Control (RBAC) & Object-Level Authorization', () => {
  const patientA = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'patient.a@amrutam.test',
    role: 'PATIENT',
  };

  const doctorA = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'doctor.a@amrutam.test',
    role: 'DOCTOR',
  };

  const admin = {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'admin@amrutam.test',
    role: 'ADMIN',
  };

  describe('RBAC on Admin Routes', () => {
    it('Patient accessing GET /api/v1/admin/analytics should receive 403 Forbidden', async () => {
      const res = await request
        .get('/api/v1/admin/analytics')
        .set(getAuthHeader(patientA));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized/i);
    });

    it('Doctor accessing GET /api/v1/admin/analytics should receive 403 Forbidden', async () => {
      const res = await request
        .get('/api/v1/admin/analytics')
        .set(getAuthHeader(doctorA));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized/i);
    });

    it('Admin accessing GET /api/v1/admin/analytics should receive 200 OK', async () => {
      const res = await request
        .get('/api/v1/admin/analytics')
        .set(getAuthHeader(admin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('metrics');
    });

    it('Admin accessing GET /api/v1/admin/audit-logs should receive 200 OK with pagination', async () => {
      const res = await request
        .get('/api/v1/admin/audit-logs?page=1&limit=5')
        .set(getAuthHeader(admin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('meta');
    });
  });

  describe('RBAC on Doctor Slot Creation', () => {
    it('Patient attempting POST /api/v1/availability should receive 403 Forbidden', async () => {
      const futureStart = new Date(Date.now() + 86400000).toISOString();
      const futureEnd = new Date(Date.now() + 86400000 + 1800000).toISOString();

      const res = await request
        .post('/api/v1/availability')
        .set(getAuthHeader(patientA))
        .send({
          slots: [{ startTime: futureStart, endTime: futureEnd }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('RBAC on Prescriptions', () => {
    it('Patient attempting POST /api/v1/prescriptions should receive 403 Forbidden', async () => {
      const res = await request
        .post('/api/v1/prescriptions')
        .set(getAuthHeader(patientA))
        .send({
          consultationId: '99999999-9999-9999-9999-999999999999',
          diagnosis: 'Self diagnosis',
          medicines: [{ name: 'Herb', dosage: '10mg', frequency: 'daily', duration: '5 days' }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
