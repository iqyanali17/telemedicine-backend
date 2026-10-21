import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/amrutam_telemedicine?schema=public',
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'test_jwt_access_secret_for_vitest_min_32_chars!',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'test_jwt_refresh_secret_for_vitest_min_32_chars!',
      PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || 'test_payment_webhook_secret_min_32_chars!',
      VIDEO_JWT_SECRET: process.env.VIDEO_JWT_SECRET || 'test_video_jwt_secret_for_vitest_min_32_chars!',
      MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY || 'test_mfa_encryption_key_min_32_chars!',
      PORT: '5001',
      LOG_LEVEL: 'silent',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', 'docs/**', 'tests/**'],
    },
  },
});
