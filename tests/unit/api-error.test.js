import { describe, it, expect } from 'vitest';
import { ApiError } from '../../src/utils/api-error.js';

describe('ApiError Utility', () => {
  it('should instantiate badRequest with 400 status', () => {
    const err = ApiError.badRequest('Invalid input field', [{ field: 'email', message: 'Required' }]);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid input field');
    expect(err.errors).toHaveLength(1);
    expect(err.isOperational).toBe(true);
  });

  it('should instantiate unauthorized with 401 status', () => {
    const err = ApiError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized access');
  });

  it('should instantiate forbidden with 403 status', () => {
    const err = ApiError.forbidden('Forbidden action');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Forbidden action');
  });

  it('should instantiate notFound with 404 status', () => {
    const err = ApiError.notFound('User not found');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('User not found');
  });

  it('should instantiate conflict with 409 status', () => {
    const err = ApiError.conflict('Duplicate email');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Duplicate email');
  });

  it('should instantiate internal with 500 status and isOperational false', () => {
    const err = ApiError.internal('Database crash');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(false);
  });
});
