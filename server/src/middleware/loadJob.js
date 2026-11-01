import { AppError } from '../utils/AppError.js';
import { prisma } from '../utils/prisma.js';

/**
 * Load the job in `req.params.id` into `req.job`, if it belongs to the logged-in
 * recruiter. Other recruiters' jobs get the same 404 as missing ones, so job ids
 * can't be probed.
 */
export async function loadOwnedJob(req, res, next) {
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, recruiterId: req.userId },
  });
  if (!job) throw new AppError(404, 'Job not found');
  req.job = job;
  next();
}
