import { Router } from 'express';

import { updateApplicationStatus } from '../controllers/candidates.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { applicationStatusBody, idParams } from '../utils/schemas.js';

const router = Router();
router.use(requireAuth);

router.patch('/:id', validate({ params: idParams, body: applicationStatusBody }), updateApplicationStatus);

export default router;
