import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import yaml from 'yamljs';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { requestLogger } from './observability/request-logger.js';
import { metricsMiddleware } from './observability/metrics.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import apiRouter from './routes/index.js';

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. Cross-Origin Resource Sharing
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  })
);

// 3. Rate Limiter (DDoS and brute force protection)
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test' || process.env.BENCHMARK === 'true',
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api/', limiter);

// 4. Request Body Parsers
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Observability (Logging and Metrics)
app.use(requestLogger);
app.use(metricsMiddleware);

// 6. Swagger API Documentation
const openApiPath = path.resolve(process.cwd(), 'docs/api-spec.yaml');
if (fs.existsSync(openApiPath)) {
  try {
    const swaggerDoc = yaml.load(openApiPath);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  } catch (err) {
    // If documentation parsing fails during startup, log warning but don't crash
    console.warn('Could not initialize Swagger UI from api-spec.yaml:', err.message);
  }
}

// 7. Base route
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Amrutam Telemedicine Backend API',
    version: '1.0.0',
    documentation: '/api-docs',
    health: '/api/v1/health',
    readiness: '/api/v1/ready',
  });
});

// 8. Mount Central API Router
app.use('/api/v1', apiRouter);

// 9. 404 Handler
app.use(notFoundHandler);

// 10. Centralized Error Handler
app.use(errorHandler);

export default app;
