import { Router } from 'express';

import { listCandidates, uploadResumes } from '../controllers/candidates.controller.js';
import { createJob, deleteJob, getJob, listJobs, rescore, updateJob } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadOwnedJob } from '../middleware/loadJob.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { uploadResumes as receiveFiles } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { candidatesQuery, idParams, jobBody } from '../utils/schemas.js';

const router = Router();
router.use(requireAuth);

// Every /:id route checks the job belongs to the logged-in recruiter.
const ownedJob = [validate({ params: idParams }), loadOwnedJob];

router.get('/', listJobs);
router.post('/', validate({ body: jobBody }), createJob);
router.get('/:id', ownedJob, getJob);
router.put('/:id', ownedJob, validate({ params: idParams, body: jobBody }), updateJob);
router.delete('/:id', ownedJob, deleteJob);

// Ownership is checked before multer, so files for someone else's job are never buffered.
router.post('/:id/resumes', ownedJob, uploadLimiter, receiveFiles, uploadResumes);
router.post('/:id/rescore', ownedJob, rescore);
router.get('/:id/candidates', ownedJob, validate({ params: idParams, query: candidatesQuery }), listCandidates);

export default router;
