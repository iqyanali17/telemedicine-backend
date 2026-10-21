import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });
};

const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

if (env.NODE_ENV === 'development') {
  prisma.$on('error', (e) => {
    logger.error({ err: e }, 'Prisma error event');
  });
}

/**
 * Checks database connection readiness safely without leaking credentials.
 * @returns {Promise<{ isHealthy: boolean, latencyMs?: number, error?: string }>}
 */
export async function checkDatabaseReadiness() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return { isHealthy: true, latencyMs };
  } catch (error) {
    logger.warn({ err: error.message }, 'Database readiness check failed');
    return {
      isHealthy: false,
      error: 'Database connection failed or unreachable',
    };
  }
}

/**
 * Disconnects Prisma client gracefully.
 */
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Database client disconnected gracefully.');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting database client');
  }
}
