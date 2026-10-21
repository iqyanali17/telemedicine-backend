import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file into process.env
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required in .env' }),
  JWT_ACCESS_SECRET: z.string({ required_error: 'JWT_ACCESS_SECRET is required in .env' }).min(16, 'JWT_ACCESS_SECRET must be at least 16 characters long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string({ required_error: 'JWT_REFRESH_SECRET is required in .env' }).min(16, 'JWT_REFRESH_SECRET must be at least 16 characters long'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  PAYMENT_WEBHOOK_SECRET: z.string({ required_error: 'PAYMENT_WEBHOOK_SECRET is required in .env' }).min(16),
  VIDEO_PROVIDER: z.enum(['MOCK_WEBRTC', 'JITSI', 'AGORA']).default('MOCK_WEBRTC'),
  VIDEO_JWT_SECRET: z.string({ required_error: 'VIDEO_JWT_SECRET is required in .env' }).min(16),
  VIDEO_SESSION_GRACE_MINUTES_BEFORE: z.coerce.number().int().min(0).default(15),
  VIDEO_SESSION_GRACE_MINUTES_AFTER: z.coerce.number().int().min(0).default(60),
  VIDEO_JITSI_DOMAIN: z.string().default('meet.jit.si'),
  VIDEO_JITSI_APP_ID: z.string().default('amrutam-telemedicine'),
  STORAGE_DIR: z.string().default('storage/secure_attachments'),
  ENABLE_IN_PROCESS_WORKER: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val !== false && val !== 'false')
    .default(true),
  MFA_ENCRYPTION_KEY: z.string({ required_error: 'MFA_ENCRYPTION_KEY is required in .env' }).min(16),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    const errorMessage = `[Environment Validation Error]\nInvalid or missing environment variables:\n${issues.join('\n')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data;
};

export const env = parseEnv();
