import { Router } from 'express';

import { getResumeDownloadUrl } from '../controllers/candidates.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../utils/schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/:id/download', validate({ params: idParams }), getResumeDownloadUrl);

export default router;
