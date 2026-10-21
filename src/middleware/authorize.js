import { ApiError } from '../utils/api-error.js';

/**
 * Role-Based Access Control (RBAC) Middleware
 * @param  {...string} allowedRoles - Roles permitted to access the route (e.g. 'ADMIN', 'DOCTOR')
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('User identity not established'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `User with role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    return next();
  };
};
