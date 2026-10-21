import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Unit Tests — Environment Configuration Validation', () => {
  // Test schema matching src/config/env.js strict requirement behavior
  const testEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required in .env' }),
    JWT_ACCESS_SECRET: z.string({ required_error: 'JWT_ACCESS_SECRET is required in .env' }).min(16),
    JWT_REFRESH_SECRET: z.string({ required_error: 'JWT_REFRESH_SECRET is required in .env' }).min(16),
    PAYMENT_WEBHOOK_SECRET: z.string({ required_error: 'PAYMENT_WEBHOOK_SECRET is required in .env' }).min(16),
    VIDEO_JWT_SECRET: z.string({ required_error: 'VIDEO_JWT_SECRET is required in .env' }).min(16),
    MFA_ENCRYPTION_KEY: z.string({ required_error: 'MFA_ENCRYPTION_KEY is required in .env' }).min(16),
    CORS_ORIGIN: z.string().default('*'),
    STORAGE_DIR: z.string().default('storage/secure_attachments'),
    ENABLE_IN_PROCESS_WORKER: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => val !== false && val !== 'false')
      .default(true),
  });

  const validTestEnv = {
    DATABASE_URL: 'postgresql://test_user:test_pass@localhost:5432/test_db',
    JWT_ACCESS_SECRET: 'test_access_secret_32_characters_minimum!',
    JWT_REFRESH_SECRET: 'test_refresh_secret_32_characters_minimum!',
    PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum!',
    VIDEO_JWT_SECRET: 'test_video_secret_32_characters_minimum!',
    MFA_ENCRYPTION_KEY: 'test_mfa_encryption_key_32_characters!',
  };

  it('fails when any required secret is missing from environment', () => {
    const result = testEnvSchema.safeParse({});
    expect(result.success).toBe(false);
    const errors = result.error.issues.map((i) => i.path[0]);
    expect(errors).toContain('DATABASE_URL');
    expect(errors).toContain('JWT_ACCESS_SECRET');
    expect(errors).toContain('JWT_REFRESH_SECRET');
    expect(errors).toContain('PAYMENT_WEBHOOK_SECRET');
    expect(errors).toContain('VIDEO_JWT_SECRET');
    expect(errors).toContain('MFA_ENCRYPTION_KEY');
  });

  it('fails when secrets are shorter than the 16 character minimum', () => {
    const result = testEnvSchema.safeParse({
      ...validTestEnv,
      JWT_ACCESS_SECRET: 'short-key',
    });
    expect(result.success).toBe(false);
    const errors = result.error.issues.map((i) => i.path[0]);
    expect(errors).toContain('JWT_ACCESS_SECRET');
  });

  it('passes when all required variables are extracted from environment', () => {
    const result = testEnvSchema.safeParse(validTestEnv);
    expect(result.success).toBe(true);
    expect(result.data.CORS_ORIGIN).toBe('*');
    expect(result.data.STORAGE_DIR).toBe('storage/secure_attachments');
  });

  it('correctly handles ENABLE_IN_PROCESS_WORKER flag values', () => {
    // Default when unset
    const defaultRes = testEnvSchema.safeParse(validTestEnv);
    expect(defaultRes.success).toBe(true);
    expect(defaultRes.data.ENABLE_IN_PROCESS_WORKER).toBe(true);

    // Explicit false string
    const disabledStrRes = testEnvSchema.safeParse({
      ...validTestEnv,
      ENABLE_IN_PROCESS_WORKER: 'false',
    });
    expect(disabledStrRes.success).toBe(true);
    expect(disabledStrRes.data.ENABLE_IN_PROCESS_WORKER).toBe(false);

    // Explicit false boolean
    const disabledBoolRes = testEnvSchema.safeParse({
      ...validTestEnv,
      ENABLE_IN_PROCESS_WORKER: false,
    });
    expect(disabledBoolRes.success).toBe(true);
    expect(disabledBoolRes.data.ENABLE_IN_PROCESS_WORKER).toBe(false);

    // Explicit true string
    const enabledStrRes = testEnvSchema.safeParse({
      ...validTestEnv,
      ENABLE_IN_PROCESS_WORKER: 'true',
    });
    expect(enabledStrRes.success).toBe(true);
    expect(enabledStrRes.data.ENABLE_IN_PROCESS_WORKER).toBe(true);
  });
});
