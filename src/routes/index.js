import { Router } from 'express';
import { checkDatabaseReadiness } from '../config/database.js';
import { getMetricsSnapshot } from '../observability/metrics.js';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import doctorRoutes from '../modules/doctors/doctor.routes.js';
import availabilityRoutes from '../modules/availability/availability.routes.js';
import consultationRoutes from '../modules/consultations/consultation.routes.js';
import prescriptionRoutes from '../modules/prescriptions/prescription.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import notificationRoutes from '../modules/notifications/notification.routes.js';

const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Liveness probe indicating application process is running
 */
router.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'amrutam-telemedicine-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

/**
 * @route   GET /api/v1/ready
 * @desc    Readiness probe validating database and critical subsystem connectivity
 */
router.get('/ready', async (req, res) => {
  const dbHealth = await checkDatabaseReadiness();

  if (!dbHealth.isHealthy) {
    return res.status(503).json({
      status: 'unhealthy',
      service: 'amrutam-telemedicine-backend',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: {
          status: 'disconnected',
          error: dbHealth.error,
        },
      },
    });
  }

  return res.status(200).json({
    status: 'ready',
    service: 'amrutam-telemedicine-backend',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: {
        status: 'connected',
        latencyMs: dbHealth.latencyMs,
      },
    },
  });
});

/**
 * @route   GET /api/v1/metrics
 * @desc    Baseline observability metrics and telemetry snapshot
 */
router.get('/metrics', (req, res) => {
  return res.status(200).json(getMetricsSnapshot());
});

// Feature modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/doctors', doctorRoutes);
router.use('/availability', availabilityRoutes);
router.use('/consultations', consultationRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);

export default router;
