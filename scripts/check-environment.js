import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

console.info('=== Amrutam Backend Environment Check ===\n');

// 1. Check Node.js Version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
const isNodeCompatible = majorVersion >= 20;

console.info(`[Node.js Runtime]`);
console.info(`  Version: ${nodeVersion}`);
console.info(`  Status:  ${isNodeCompatible ? 'PASS (Node 20+ LTS)' : 'FAIL (Node 20+ required)'}\n`);

// 2. Check Environment Variables
console.info(`[Environment Configuration]`);
const requiredVars = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PORT',
];

const envStatus = requiredVars.map((key) => {
  const val = process.env[key];
  const isSet = Boolean(val && val.trim().length > 0);
  return { variable: key, configured: isSet };
});

envStatus.forEach((s) => {
  console.info(`  ${s.variable}: ${s.configured ? 'Configured' : 'MISSING'}`);
});
console.info('');

// 3. Check Database Connection
console.info(`[PostgreSQL Database Connectivity]`);
if (!process.env.DATABASE_URL) {
  console.warn('  DATABASE_URL is not set in environment or .env file.');
} else {
  // Parse host without logging credentials
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.info(`  Target Host: ${url.hostname}:${url.port || 5432}`);
    console.info(`  Database:    ${url.pathname.replace('/', '')}`);
  } catch {
    console.info('  Target: Custom connection string format');
  }

  const prisma = new PrismaClient({
    log: ['error'],
  });

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    console.info(`  Status:      CONNECTED (Latency: ${latency}ms)`);
  } catch (error) {
    console.error(`  Status:      FAILED to connect to PostgreSQL`);
    console.error(`  Detail:      ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

console.info('\n=== Check Complete ===');
