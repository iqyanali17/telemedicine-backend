import { Router } from 'express';
import { DoctorController } from './doctor.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  listDoctorsQuerySchema,
  doctorParamSchema,
  updateDoctorProfileSchema,
} from './doctor.validation.js';

const router = Router();

// Public discovery endpoints
router.get('/', validateRequest({ query: listDoctorsQuerySchema }), DoctorController.list);

// Authenticated doctor profile management
router.patch(
  '/profile',
  authenticate,
  authorize('DOCTOR'),
  validateRequest({ body: updateDoctorProfileSchema }),
  DoctorController.updateProfile
);

router.get('/:id', validateRequest({ params: doctorParamSchema }), DoctorController.getById);

export default router;
