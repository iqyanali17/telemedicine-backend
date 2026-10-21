import { logger } from './config/logger.js';
import { disconnectDatabase } from './config/database.js';
import { notificationQueueWorker } from './modules/notifications/notification-queue.worker.js';

logger.info('Starting Amrutam background notification queue worker...');

// Start background worker polling loop
notificationQueueWorker.start();

/**
 * Graceful shutdown coordinator for standalone worker process
 */
const shutdown = async (signal) => {
  logger.info(`Worker received ${signal}. Shutting down gracefully...`);

  // Stop polling interval
  notificationQueueWorker.stop();

  try {
    // Disconnect database client cleanly
    await disconnectDatabase();
    logger.info('Worker database connection closed.');
  } catch (err) {
    logger.error({ err }, 'Error during worker database disconnection');
  }

  logger.info('Worker shutdown completed. Exiting process.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Worker Unhandled Promise Rejection detected');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Worker Uncaught Exception detected');
  shutdown('uncaughtException');
});
