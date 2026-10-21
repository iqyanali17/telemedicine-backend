import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  registerSchema,
  registerDoctorSchema,
  loginSchema,
  refreshTokenSchema,
  mfaLoginSchema,
  mfaVerifySchema,
  mfaDisableSchema,
} from './auth.validation.js';

const router = Router();

// Public auth endpoints
router.post('/register', validateRequest({ body: registerSchema }), AuthController.register);
router.post('/doctor/register', validateRequest({ body: registerDoctorSchema }), AuthController.registerDoctor);
router.post('/login', validateRequest({ body: loginSchema }), AuthController.login);
router.post('/mfa/login', validateRequest({ body: mfaLoginSchema }), AuthController.mfaLogin);
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), AuthController.refresh);
router.post('/logout', validateRequest({ body: refreshTokenSchema }), AuthController.logout);

// Protected session & MFA endpoints
router.get('/me', authenticate, AuthController.getProfile);
router.post('/mfa/setup', authenticate, AuthController.mfaSetup);
router.post('/mfa/verify', authenticate, validateRequest({ body: mfaVerifySchema }), AuthController.mfaVerify);
router.post('/mfa/disable', authenticate, validateRequest({ body: mfaDisableSchema }), AuthController.mfaDisable);

export default router;
