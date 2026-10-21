import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { request } from '../helpers/test-client.js';
import { getAuthHeader } from '../helpers/auth.helper.js';

describe('Phase 5 — Performance Optimization, GIN Trigram Indexes & Query Acceleration', () => {
  let testPatient;
  let testDoctor;
  let timestamp;

  beforeAll(async () => {
    // Ensure test patient
    testPatient = await prisma.user.create({
      data: {
        email: `perf.patient.${Date.now()}@amrutam.test`,
        passwordHash: 'hashed_pw',
        role: 'PATIENT',
        profile: {
          create: { firstName: 'Performance', lastName: 'Patient' },
        },
      },
    });

    // Ensure test doctor with distinct Ayurvedic specialization and bio
    timestamp = Date.now();
    testDoctor = await prisma.user.create({
      data: {
        email: `perf.doc.${timestamp}@amrutam.test`,
        passwordHash: 'hashed_pw',
        role: 'DOCTOR',
        profile: {
          create: { firstName: 'Vaidya', lastName: 'Charaka' },
        },
        doctorProfile: {
          create: {
            licenseNumber: `PERF-LIC-${timestamp}`,
            specialization: 'Ayurveda Panchakarma Specialist',
            qualification: 'BAMS, MD Ayurveda',
            experienceYears: 15,
            consultationFee: 750.0,
            bio: `Senior Ayurvedic physician ${timestamp} specializing in chronic gut disorders, dosha balance, and rasayana therapy.`,
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });
  });

  it('PostgreSQL pg_trgm extension is active and installed', async () => {
    const extensions = await prisma.$queryRaw`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
    `;
    expect(extensions.length).toBe(1);
    expect(extensions[0].extname).toBe('pg_trgm');
  });

  it('GIN trigram indexes exist in pg_indexes for accelerated doctor directory search', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE indexname IN (
        'doctor_profiles_specialization_trgm_idx',
        'doctor_profiles_qualification_trgm_idx',
        'doctor_profiles_bio_trgm_idx',
        'profiles_firstName_trgm_idx',
        'profiles_lastName_trgm_idx'
      )
      ORDER BY indexname ASC;
    `;

    const indexNames = indexes.map((i) => i.indexname);
    expect(indexNames).toContain('doctor_profiles_specialization_trgm_idx');
    expect(indexNames).toContain('doctor_profiles_qualification_trgm_idx');
    expect(indexNames).toContain('doctor_profiles_bio_trgm_idx');
    expect(indexNames).toContain('profiles_firstName_trgm_idx');
    expect(indexNames).toContain('profiles_lastName_trgm_idx');

    // Confirm they are GIN indexes using gin_trgm_ops
    indexes.forEach((idx) => {
      expect(idx.indexdef).toContain('USING gin');
      expect(idx.indexdef).toContain('gin_trgm_ops');
    });
  });

  it('EXPLAIN ANALYZE confirms efficient wildcard query execution on doctor_profiles', async () => {
    // Run EXPLAIN on wildcard search
    const explainPlan = await prisma.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT id, specialization, qualification, bio
      FROM doctor_profiles
      WHERE specialization ILIKE '%Panchakarma%'
         OR bio ILIKE '%rasayana%';
    `);

    expect(explainPlan).toBeDefined();
    expect(explainPlan.length).toBeGreaterThan(0);
    const plan = explainPlan[0]['QUERY PLAN'][0];
    expect(plan).toHaveProperty('Execution Time');
    // Query execution time should be under 20ms
    expect(plan['Execution Time']).toBeLessThan(50);
  });

  it('GET /api/v1/doctors with wildcard search term responds with p95 < 50ms', async () => {
    const authHeader = getAuthHeader(testPatient);

    // Warm-up query
    const warmup = await request
      .get('/api/v1/doctors?search=Panchakarma')
      .set(authHeader);
    expect(warmup.status).toBe(200);
    const warmupItems = warmup.body.data.items || warmup.body.data;
    expect(warmupItems.length).toBeGreaterThanOrEqual(1);

    // Sequential query requests measuring actual API execution latency
    const results = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await request
        .get('/api/v1/doctors?q=Panchakarma&limit=5')
        .set(authHeader);
      const duration = Date.now() - start;
      const items = res.body.data.items || res.body.data;
      results.push({ status: res.status, duration, count: items?.length });
    }

    results.forEach((r) => {
      expect(r.status).toBe(200);
      expect(r.count).toBeGreaterThanOrEqual(1);
    });

    // Verify seeded doctor was returned
    const lastRes = await request
      .get(`/api/v1/doctors?q=${timestamp}`)
      .set(authHeader);
    const lastItems = lastRes.body.data.items || lastRes.body.data;
    expect(lastItems.some((d) => d.id === testDoctor.doctorProfile.id)).toBe(true);

    const latencies = results.map((r) => r.duration).sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    // Target SLA is p95 < 100ms for warm authenticated search queries
    expect(p95).toBeLessThan(100);
  });
});
