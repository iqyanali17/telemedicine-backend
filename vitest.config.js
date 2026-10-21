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
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ,
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
