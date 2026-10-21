import { Router } from 'express';
import { UserController } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { updateProfileSchema } from './user.validation.js';

const router = Router();

router.use(authenticate);

router.get('/profile', UserController.getProfile);
router.patch('/profile', validateRequest({ body: updateProfileSchema }), UserController.updateProfile);

export default router;
