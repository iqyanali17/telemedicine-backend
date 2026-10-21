export class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - User-friendly error message
   * @param {Array|object} [errors=[]] - Field-level errors or additional context
   * @param {boolean} [isOperational=true] - True if this is an expected operational error
   * @param {string} [stack=''] - Optional stack trace override
   */
  constructor(statusCode, message, errors = [], isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message = 'Bad Request', errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized access', errors = []) {
    return new ApiError(401, message, errors);
  }

  static forbidden(message = 'Forbidden access to this resource', errors = []) {
    return new ApiError(403, message, errors);
  }

  static notFound(message = 'Resource not found', errors = []) {
    return new ApiError(404, message, errors);
  }

  static conflict(message = 'Resource conflict or duplicate entry', errors = []) {
    return new ApiError(409, message, errors);
  }

  static unprocessableEntity(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }

  static unprocessable(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }

  static internal(message = 'Internal server error', errors = []) {
    return new ApiError(500, message, errors, false);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', errors = []) {
    return new ApiError(503, message, errors);
  }
}
