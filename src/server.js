import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectDatabase } from './config/database.js';
import { notificationQueueWorker } from './modules/notifications/notification-queue.worker.js';

const server = app.listen(env.PORT, () => {
  logger.info(
    `Amrutam Telemedicine Backend listening on port ${env.PORT} in [${env.NODE_ENV}] mode`
  );
  logger.info(`Health check: http://localhost:${env.PORT}/api/v1/health`);
  logger.info(`Readiness probe: http://localhost:${env.PORT}/api/v1/ready`);
  logger.info(`API Documentation: http://localhost:${env.PORT}/api-docs`);

  // Start background notification queue worker if enabled in this process
  if (env.ENABLE_IN_PROCESS_WORKER) {
    logger.info('In-process notification queue worker enabled. Starting poller...');
    notificationQueueWorker.start();
  } else {
    logger.info('In-process notification queue worker disabled (delegated to external worker).');
  }
});

/**
 * Graceful shutdown coordinator
 */
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop background worker if running in this process
  if (env.ENABLE_IN_PROCESS_WORKER) {
    notificationQueueWorker.stop();
  }

  // Stop accepting new requests
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
      process.exit(1);
    }
    logger.info('HTTP server closed.');

    // Disconnect database client
    await disconnectDatabase();

    logger.info('Graceful shutdown completed. Exiting process.');
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection detected');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception detected');
  shutdown('uncaughtException');
});
