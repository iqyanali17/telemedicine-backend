import { Router } from 'express';
import { AvailabilityController } from './availability.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  querySlotsSchema,
  createSlotsSchema,
  slotParamSchema,
} from './availability.validation.js';

const router = Router();

router.get(
  '/',
  validateRequest({ query: querySlotsSchema }),
  AvailabilityController.getSlots
);

router.post(
  '/',
  authenticate,
  authorize('DOCTOR'),
  validateRequest({ body: createSlotsSchema }),
  AvailabilityController.createSlots
);

router.delete(
  '/:id',
  authenticate,
  authorize('DOCTOR'),
  validateRequest({ params: slotParamSchema }),
  AvailabilityController.deleteSlot
);

export default router;
