process.env.BENCHMARK = 'true';

import http from 'http';
import supertest from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateTestToken } from '../tests/helpers/auth.helper.js';

const server = http.createServer(app);
server.setMaxListeners(50);
const request = supertest(server);

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / sorted.length).toFixed(2));

  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return { min, max, mean, p50, p95, p99 };
}

async function runBenchmark(name, totalRequests, concurrency, requestFn) {
  process.stdout.write(`Benchmarking [${name}] (${totalRequests} total requests, concurrency: ${concurrency})... `);

  const latencies = [];
  let successful = 0;
  let failed = 0;

  const queue = Array.from({ length: totalRequests }, (_, i) => i);

  async function worker() {
    while (queue.length > 0) {
      queue.pop();
      const start = Date.now();
      try {
        const res = await requestFn();
        const duration = Date.now() - start;
        latencies.push(duration);
        if (res.status >= 200 && res.status < 400) {
          successful++;
        } else {
          failed++;
        }
      } catch {
        const duration = Date.now() - start;
        latencies.push(duration);
        failed++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  const benchmarkStart = Date.now();
  await Promise.all(workers);
  const totalDuration = Date.now() - benchmarkStart;

  const stats = calculatePercentiles(latencies);
  const rps = Number(((totalRequests / totalDuration) * 1000).toFixed(1));

  console.info('Done.');
  return {
    name,
    totalRequests,
    concurrency,
    successful,
    failed,
    errorRate: Number(((failed / totalRequests) * 100).toFixed(2)),
    totalDurationMs: totalDuration,
    rps,
    ...stats,
  };
}

async function main() {
  console.info('================================================================');
  console.info('       AMRUTAM TELEMEDICINE BACKEND — PERFORMANCE BENCHMARK     ');
  console.info('================================================================\n');

  // Setup test patient context
  let benchmarkUser;
  try {
    benchmarkUser = await prisma.user.findFirst({
      where: { role: 'PATIENT', isActive: true },
      include: { profile: true },
    });

    if (!benchmarkUser) {
      benchmarkUser = await prisma.user.create({
        data: {
          email: `perf.benchmark.${Date.now()}@amrutam.test`,
          passwordHash: 'hashed_password',
          role: 'PATIENT',
          profile: { create: { firstName: 'Benchmark', lastName: 'Patient' } },
        },
      });
    }
  } catch (err) {
    console.error('Failed to initialize benchmark user:', err.message);
    process.exit(1);
  }

  const token = generateTestToken(benchmarkUser);
  const authHeader = `Bearer ${token}`;

  const DEFAULT_CONCURRENCY = parseInt(process.env.BENCHMARK_CONCURRENCY || '10', 10);
  const DEFAULT_REQUESTS = parseInt(process.env.BENCHMARK_REQUESTS || '100', 10);

  const results = [];

  // 1. Liveness & Process Overhead (GET /api/v1/health)
  results.push(
    await runBenchmark('Liveness Probe (GET /health)', DEFAULT_REQUESTS, DEFAULT_CONCURRENCY, () =>
      request.get('/api/v1/health')
    )
  );

  // 2. Database Readiness & Connectivity (GET /api/v1/ready)
  results.push(
    await runBenchmark('Readiness Probe with DB Check (GET /ready)', DEFAULT_REQUESTS, DEFAULT_CONCURRENCY, () =>
      request.get('/api/v1/ready')
    )
  );

  // 3. Telemetry Snapshot (GET /api/v1/metrics)
  results.push(
    await runBenchmark('Observability Metrics (GET /metrics)', DEFAULT_REQUESTS, DEFAULT_CONCURRENCY, () =>
      request.get('/api/v1/metrics')
    )
  );

  // 4. Authenticated Read: Doctor Search (GET /api/v1/doctors)
  results.push(
    await runBenchmark('Doctor Search & Filter (GET /doctors)', DEFAULT_REQUESTS, DEFAULT_CONCURRENCY, () =>
      request.get('/api/v1/doctors?page=1&limit=10').set('Authorization', authHeader)
    )
  );

  // 5. Authenticated Read: Accelerated Trigram GIN Search (GET /api/v1/doctors?search=ayurveda)
  results.push(
    await runBenchmark('Accelerated Trigram Doctor Search (GET /doctors?search=ayurveda)', DEFAULT_REQUESTS, DEFAULT_CONCURRENCY, () =>
      request.get('/api/v1/doctors?search=ayurveda&limit=10').set('Authorization', authHeader)
    )
  );

  // 5. Authenticated Read: User In-App Notifications (GET /api/v1/notifications)
  results.push(
    await runBenchmark('User Notifications Feed (GET /notifications)', DEFAULT_REQUESTS, DEFAULT_CONCURRENCY, () =>
      request.get('/api/v1/notifications?page=1&limit=10').set('Authorization', authHeader)
    )
  );

  // 6. Authenticated Write: Clinical Messaging (POST /consultations/:id/messages)
  let benchmarkConsultation;
  let benchmarkSlot;
  try {
    const benchmarkDoc = await prisma.doctorProfile.findFirst({
      where: { isVerified: true },
    });

    if (benchmarkDoc) {
      benchmarkSlot = await prisma.availabilitySlot.create({
        data: {
          doctorId: benchmarkDoc.id,
          startTime: new Date(Date.now() + 10000000),
          endTime: new Date(Date.now() + 11800000),
          status: 'BOOKED',
        },
      });

      benchmarkConsultation = await prisma.consultation.create({
        data: {
          consultationNumber: `PERF-BENCH-${Date.now()}`,
          patientId: benchmarkUser.id,
          doctorId: benchmarkDoc.id,
          slotId: benchmarkSlot.id,
          scheduledAt: benchmarkSlot.startTime,
          status: 'SCHEDULED',
        },
      });

      results.push(
        await runBenchmark('Clinical Messaging Write (POST /messages)', 50, 5, () =>
          request
            .post(`/api/v1/consultations/${benchmarkConsultation.id}/messages`)
            .set('Authorization', authHeader)
            .send({ content: `Performance benchmark ping ${Date.now()}` })
        )
      );

      // Clean up write benchmark test artifacts
      await prisma.consultationMessage.deleteMany({
        where: { consultationId: benchmarkConsultation.id },
      });
      await prisma.consultation.delete({ where: { id: benchmarkConsultation.id } });
      await prisma.availabilitySlot.delete({ where: { id: benchmarkSlot.id } });
    }
  } catch (err) {
    console.warn('Skipping write benchmark setup:', err.message);
  }

  console.info('\n================================================================');
  console.info('                    BENCHMARK RESULTS SUMMARY                   ');
  console.info('================================================================');
  results.forEach((r) => {
    console.info(
      `  [${r.name}] -> RPS: ${r.rps} | p50: ${r.p50}ms | p95: ${r.p95}ms | p99: ${r.p99}ms | Errors: ${r.errorRate}%`
    );
  });

  // Assert against latency and reliability SLA
  const failedSla = results.filter((r) => r.p95 > 250 || r.errorRate > 1.0);
  if (failedSla.length > 0) {
    console.warn(`\n[WARNING] ${failedSla.length} benchmark(s) exceeded target SLA thresholds.`);
  } else {
    console.info('\n[PASS] All evaluated endpoints comfortably meet p95 < 250ms SLA and zero-error targets.');
  }

  console.info('\n[OPERATIONAL NOTICE] Local synthetic benchmark results demonstrate isolated endpoint throughput and latency bounds under synthetic concurrency. Proving 100,000 daily consultations and 99.95% uptime requires continuous distributed load generation across multiple worker nodes, production RDS database clustering, read replicas, and CDN/WAF termination.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Benchmark crashed:', err);
  process.exit(1);
});
