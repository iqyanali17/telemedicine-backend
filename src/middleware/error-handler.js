import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Centralized Error Handling Middleware
 */
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];
  let isOperational = err.isOperational ?? false;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 422;
    message = 'Request validation failed';
    isOperational = true;
    errors = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
  }

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    isOperational = true;
    if (err.code === 'P2002') {
      statusCode = 409;
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target || 'field';
      if (target.includes('email')) {
        message = 'Conflict: An account with this email already exists';
      } else if (target.includes('phone')) {
        message = 'Conflict: An account with this phone number already exists';
      } else {
        message = `Conflict: Duplicate entry for ${target}. This ${target} already exists.`;
      }
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Requested record not found in database';
    } else {
      statusCode = 400;
      message = 'Database operation failed';
    }
  }

  // Handle invalid JSON body syntax errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON in request body';
    isOperational = true;
  }

  // Log unexpected server errors
  if (!isOperational || statusCode >= 500) {
    logger.error({
      err,
      method: req.method,
      url: req.originalUrl,
      requestId: req.id,
    }, 'Unhandled application error');
  }

  const responsePayload = {
    success: false,
    statusCode,
    message,
    ...(errors.length > 0 && { errors }),
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  return res.status(statusCode).json(responsePayload);
};
