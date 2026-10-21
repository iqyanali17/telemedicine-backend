import { Router } from 'express';
import { PrescriptionController } from './prescription.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  createPrescriptionSchema,
  prescriptionParamSchema,
  prescriptionConsultationParamSchema,
} from './prescription.validation.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('DOCTOR'),
  validateRequest({ body: createPrescriptionSchema }),
  PrescriptionController.create
);

router.get(
  '/consultation/:consultationId',
  validateRequest({ params: prescriptionConsultationParamSchema }),
  PrescriptionController.getByConsultation
);

router.get(
  '/:id',
  validateRequest({ params: prescriptionParamSchema }),
  PrescriptionController.getById
);

router.get(
  '/:id/pdf',
  validateRequest({ params: prescriptionParamSchema }),
  PrescriptionController.downloadPdf
);

export default router;
